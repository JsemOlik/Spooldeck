"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { filaments, spools, usageLogs } from "@/db/schema";
import { brandIdByName, materialIdByName, vendorIdByName } from "@/db/queries/catalog";
import { findFilamentByGoodsId } from "@/db/queries/filaments";
import { getSpoolIdByCode, getSpoolIdByPrusamentId } from "@/db/queries/spools";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject, fromZodError } from "@/lib/action-state";
import { generateSpoolCode } from "@/lib/codes";
import { PrusamentError, fetchPrusamentSpool, mapPrusamentData, parsePrusamentUrl, prusamentSpoolUrl } from "@/lib/prusament";
import { classifyScan } from "@/lib/scan";
import { getAppSettings } from "@/lib/settings";
import { spoolSchema } from "@/lib/validation";

export type ScanResult = { href: string } | { error: string; text?: string };

export async function resolveScanAction(text: string, openLog: boolean): Promise<ScanResult> {
  await requireUser();
  const target = classifyScan(String(text).slice(0, 2000));
  const suffix = openLog ? "?scanned=1" : "";
  if (target.kind === "prusament") {
    const id = await getSpoolIdByPrusamentId(target.ref.spoolId);
    if (id) return { href: `/spools/${id}${suffix}` };
    return { href: `/scan/prusament?u=${encodeURIComponent(prusamentSpoolUrl(target.ref))}` };
  }
  if (target.kind === "code") {
    const id = await getSpoolIdByCode(target.code);
    if (id) return { href: `/spools/${id}${suffix}` };
    return { error: `No spool with code ${target.code}.` };
  }
  return { error: "That code isn't a Prusament spool or a Spooldeck label.", text: target.text };
}

const importSchema = spoolSchema
  .pick({ price: true, currency: true, vendor: true, purchaseDate: true, location: true, notes: true })
  .extend({
    url: z.string(),
    remaining: z.coerce.number().min(0).max(100_000).optional(),
  });

export async function importPrusamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = importSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const ref = parsePrusamentUrl(parsed.data.url);
  if (!ref) return { error: "Invalid Prusament URL." };

  const existing = await getSpoolIdByPrusamentId(ref.spoolId);
  if (existing) redirect(`/spools/${existing}`);

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
  revalidatePath("/", "layout");
  redirect(`/spools/${spool.id}?created=1`);
}
