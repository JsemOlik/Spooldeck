import { z } from "zod";
import { db } from "@/db";
import { filaments, spools, usageLogs } from "@/db/schema";
import { brandIdByName, materialIdByName, vendorIdByName } from "@/db/queries/catalog";
import { findFilamentByGoodsId } from "@/db/queries/filaments";
import { getSpoolIdByCode, getSpoolIdByPrusamentId } from "@/db/queries/spools";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { generateSpoolCode } from "@/lib/codes";
import { PrusamentError, fetchPrusamentSpool, mapPrusamentData, parsePrusamentUrl, pickPrice, prusamentSpoolUrl } from "@/lib/prusament";
import { classifyScan } from "@/lib/scan";
import { getAppSettings } from "@/lib/settings";
import { spoolSchema } from "@/lib/validation";
import type { Input } from "./spools";

export type ResolvedScan =
  | { kind: "spool"; id: number }
  | { kind: "prusament"; url: string }
  | { kind: "error"; error: string; text?: string };

export async function resolveScan(text: string): Promise<ResolvedScan> {
  const target = classifyScan(String(text).slice(0, 2000));
  if (target.kind === "prusament") {
    const id = await getSpoolIdByPrusamentId(target.ref.spoolId);
    if (id) return { kind: "spool", id };
    return { kind: "prusament", url: prusamentSpoolUrl(target.ref) };
  }
  if (target.kind === "code") {
    const id = await getSpoolIdByCode(target.code);
    if (id) return { kind: "spool", id };
    return { kind: "error", error: `No spool with code ${target.code}.` };
  }
  return { kind: "error", error: "That code isn't a Prusament spool or a Spooldeck label.", text: target.text };
}

/** Fetches a Prusament spool page and describes what importing it would do. */
export async function previewPrusament(rawUrl: string) {
  const ref = parsePrusamentUrl(rawUrl);
  if (!ref) return { error: "Invalid Prusament URL." } as const;
  const existingSpoolId = await getSpoolIdByPrusamentId(ref.spoolId);
  if (existingSpoolId) return { existingSpoolId } as const;
  try {
    const page = await fetchPrusamentSpool(ref);
    const mapped = mapPrusamentData(page.data, ref);
    const settings = await getAppSettings();
    const known = mapped.filament.prusamentGoodsId ? await findFilamentByGoodsId(mapped.filament.prusamentGoodsId) : undefined;
    return {
      url: prusamentSpoolUrl(ref),
      filament: mapped.filament,
      spool: mapped.spool,
      existingFilament: known ? { id: known.id, name: known.name } : null,
      price: pickPrice(page.prices, settings.currency) ?? null,
    } as const;
  } catch (e) {
    return { error: e instanceof PrusamentError ? e.message : "Something went wrong talking to prusament.com." } as const;
  }
}

const importSchema = spoolSchema
  .pick({ price: true, currency: true, vendor: true, purchaseDate: true, location: true, notes: true })
  .extend({
    url: z.string(),
    remaining: z.coerce.number().min(0).max(100_000).optional(),
  });

export async function importPrusament(input: Input): Promise<ActionState & { id?: number; existing?: boolean }> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const ref = parsePrusamentUrl(parsed.data.url);
  if (!ref) return { error: "Invalid Prusament URL." };

  const existing = await getSpoolIdByPrusamentId(ref.spoolId);
  if (existing) return { ok: true, id: existing, existing: true };

  let mapped;
  try {
    mapped = mapPrusamentData((await fetchPrusamentSpool(ref)).data, ref);
  } catch (e) {
    return { error: e instanceof PrusamentError ? e.message : "Import failed." };
  }
  if (parsed.data.remaining != null && parsed.data.remaining > mapped.spool.initialWeight) {
    return { fieldErrors: { remaining: [`Can't exceed ${mapped.spool.initialWeight} g`] } };
  }

  const settings = await getAppSettings();
  const { brand, material, ...filamentValues } = mapped.filament;
  let filament = filamentValues.prusamentGoodsId ? await findFilamentByGoodsId(filamentValues.prusamentGoodsId) : undefined;
  if (!filament) {
    [filament] = await db
      .insert(filaments)
      .values({ ...filamentValues, brandId: await brandIdByName(brand), materialId: await materialIdByName(material) })
      .returning();
  }

  let code = generateSpoolCode();
  while (await getSpoolIdByCode(code)) code = generateSpoolCode();

  const { remaining, vendor, ...purchase } = parsed.data;
  const partlyUsed = remaining != null && remaining < mapped.spool.initialWeight;
  const [spool] = await db
    .insert(spools)
    .values({
      ...mapped.spool,
      filamentId: filament.id,
      code,
      price: purchase.price ?? null,
      currency: purchase.currency ?? settings.currency,
      purchaseDate: purchase.purchaseDate ?? null,
      location: purchase.location ?? null,
      notes: purchase.notes ?? null,
      vendorId: await vendorIdByName(vendor),
      status: partlyUsed ? "opened" : "sealed",
      openedAt: partlyUsed ? new Date() : null,
    })
    .returning({ id: spools.id });

  if (partlyUsed) {
    await db.insert(usageLogs).values({
      spoolId: spool.id,
      grams: mapped.spool.initialWeight - remaining,
      kind: "adjustment",
      note: "Starting weight when added to Spooldeck",
    });
  }
  return { ok: true, id: spool.id };
}
