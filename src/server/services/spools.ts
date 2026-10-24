import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { filamentNotes, filaments, spools, usageLogs, type SpoolStatus } from "@/db/schema";
import { vendorIdByName } from "@/db/queries/catalog";
import { getSpoolUsed } from "@/db/queries/spools";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { generateSpoolCode } from "@/lib/codes";
import { getAppSettings } from "@/lib/settings";
import { newSpoolSchema, nullify, printSchema, spoolSchema, usageSchema, weighInSchema } from "@/lib/validation";
import { weighInUsage } from "@/lib/weights";

/**
 * Spool mutations shared by the Server Actions (src/actions/spools.ts) and the JSON API
 * (src/app/api/v1). Inputs are plain string records as produced by formToObject/jsonToInput.
 */
export type Input = Record<string, string | undefined>;

export async function uniqueSpoolCode() {
  for (let i = 0; i < 20; i++) {
    const code = generateSpoolCode();
    const exists = await db.query.spools.findFirst({ where: eq(spools.code, code), columns: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique spool code");
}

export async function createSpools(input: Input): Promise<ActionState & { ids?: number[]; filamentId?: number }> {
  const parsed = newSpoolSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { quantity = 1, remaining, vendor, ...data } = parsed.data;

  const filament = await db.query.filaments.findFirst({ where: eq(filaments.id, data.filamentId) });
  if (!filament) return { fieldErrors: { filamentId: ["Filament not found"] } };
  if (remaining != null && remaining > data.initialWeight) {
    return { fieldErrors: { remaining: ["Can't be more than the initial weight"] } };
  }

  const settings = await getAppSettings();
  const vendorId = await vendorIdByName(vendor);
  const ids: number[] = [];
  for (let i = 0; i < quantity; i++) {
    const status: SpoolStatus = data.status ?? (remaining != null && remaining < data.initialWeight ? "opened" : "sealed");
    const [row] = await db
      .insert(spools)
      .values({
        ...nullify(data),
        currency: data.currency ?? settings.currency,
        spoolWeight: data.spoolWeight ?? filament.spoolWeight,
        vendorId,
        status,
        openedAt: status === "opened" ? new Date() : null,
        code: await uniqueSpoolCode(),
      })
      .returning({ id: spools.id });
    ids.push(row.id);
    if (remaining != null && remaining < data.initialWeight) {
      await db.insert(usageLogs).values({
        spoolId: row.id,
        grams: data.initialWeight - remaining,
        kind: "adjustment",
        note: "Starting weight when added to Spooldeck",
      });
    }
  }
  return { ok: true, ids, filamentId: data.filamentId };
}

export async function updateSpool(id: number, input: Input): Promise<ActionState> {
  const parsed = spoolSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { vendor, status, ...data } = parsed.data;

  const current = await db.query.spools.findFirst({ where: eq(spools.id, id) });
  if (!current) return { error: "Spool not found" };

  await db
    .update(spools)
    .set({
      ...nullify(data),
      vendorId: await vendorIdByName(vendor),
      status: status ?? current.status,
      openedAt: status === "opened" && !current.openedAt ? new Date() : current.openedAt,
    })
    .where(eq(spools.id, id));
  return { ok: true };
}

export async function setSpoolStatus(id: number, status: SpoolStatus) {
  const current = await db.query.spools.findFirst({ where: eq(spools.id, id), columns: { openedAt: true } });
  await db
    .update(spools)
    .set({ status, openedAt: status === "opened" && !current?.openedAt ? new Date() : current?.openedAt })
    .where(eq(spools.id, id));
}

export async function deleteSpool(id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(usageLogs).where(eq(usageLogs.spoolId, id));
    await tx.update(filamentNotes).set({ spoolId: null }).where(eq(filamentNotes.spoolId, id));
    await tx.delete(spools).where(eq(spools.id, id));
  });
}

/** Keeps the spool status in sync with its remaining weight after usage changes. */
export async function syncStatus(spoolId: number) {
  const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
  if (!spool || spool.status === "archived") return;
  const used = await getSpoolUsed(spoolId);
  const remaining = spool.initialWeight - used;
  let status: SpoolStatus = spool.status;
  if (remaining <= 0) status = "empty";
  else if (spool.status === "empty" || (spool.status === "sealed" && used > 0)) status = "opened";
  if (status !== spool.status || (status === "opened" && !spool.openedAt)) {
    await db
      .update(spools)
      .set({ status, openedAt: spool.openedAt ?? (status === "opened" ? new Date() : null) })
      .where(eq(spools.id, spoolId));
  }
}

export async function logUsage(spoolId: number, input: Input): Promise<ActionState> {
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const exists = await db.query.spools.findFirst({ where: eq(spools.id, spoolId), columns: { id: true } });
  if (!exists) return { error: "Spool not found" };

  await db.insert(usageLogs).values({
    spoolId,
    grams: parsed.data.grams,
    kind: "print",
    printName: parsed.data.printName ?? null,
    note: parsed.data.note ?? null,
  });
  await syncStatus(spoolId);
  return { ok: true, message: `Logged ${parsed.data.grams} g` };
}

/**
 * Logs one print across several spools (one entry per filament in a sliced file).
 * Takes a plain object rather than a string record because `usage` is a list.
 */
export async function logPrint(input: unknown): Promise<ActionState & { usageIds?: number[] }> {
  const parsed = printSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { usage } = parsed.data;
  const printName = parsed.data.printName?.trim() || null;
  const note = parsed.data.note?.trim() || null;

  // Two extruders loaded from the same spool become one entry.
  const bySpool = new Map<number, number>();
  for (const u of usage) bySpool.set(u.spoolId, (bySpool.get(u.spoolId) ?? 0) + u.grams);
  const spoolIds = [...bySpool.keys()];
  const found = await db.select({ id: spools.id }).from(spools).where(inArray(spools.id, spoolIds));
  if (found.length !== spoolIds.length) return { error: "Spool not found" };

  const rows = await db
    .insert(usageLogs)
    .values(spoolIds.map((spoolId) => ({ spoolId, grams: Math.round(bySpool.get(spoolId)! * 100) / 100, kind: "print" as const, printName, note })))
    .returning({ id: usageLogs.id });
  for (const id of spoolIds) await syncStatus(id);

  const total = Math.round([...bySpool.values()].reduce((a, b) => a + b, 0) * 100) / 100;
  return {
    ok: true,
    usageIds: rows.map((r) => r.id),
    message: spoolIds.length === 1 ? `Logged ${total} g` : `Logged ${total} g across ${spoolIds.length} spools`,
  };
}

export async function weighIn(spoolId: number, input: Input): Promise<ActionState> {
  const parsed = weighInSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId) });
  if (!spool) return { error: "Spool not found" };
  const includesSpool = parsed.data.includesSpool === "on";
  if (includesSpool && spool.spoolWeight == null) {
    return { fieldErrors: { scaleGrams: ["Set the empty spool weight on this spool first, or weigh filament only."] } };
  }

  const currentRemaining = spool.initialWeight - (await getSpoolUsed(spoolId));
  const delta = weighInUsage({
    scaleGrams: parsed.data.scaleGrams,
    includesSpool,
    spoolWeight: spool.spoolWeight,
    currentRemaining,
  });
  if (delta === 0) return { ok: true, message: "Weight unchanged" };

  await db.insert(usageLogs).values({
    spoolId,
    grams: delta,
    kind: "weigh_in",
    note: parsed.data.note ?? `Scale reading ${parsed.data.scaleGrams} g${includesSpool ? " (with spool)" : ""}`,
  });
  await syncStatus(spoolId);
  return { ok: true, message: delta > 0 ? `Recorded ${delta} g used` : `Added back ${-delta} g` };
}

export async function deleteUsage(usageId: number) {
  const row = await db.query.usageLogs.findFirst({ where: eq(usageLogs.id, usageId) });
  if (!row) return false;
  await db.delete(usageLogs).where(eq(usageLogs.id, usageId));
  await syncStatus(row.spoolId);
  return true;
}
