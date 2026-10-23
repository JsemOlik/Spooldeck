"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { filamentNotes, filaments, spools, usageLogs, type SpoolStatus } from "@/db/schema";
import { vendorIdByName } from "@/db/queries/catalog";
import { getSpoolUsed } from "@/db/queries/spools";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject, fromZodError } from "@/lib/action-state";
import { generateSpoolCode } from "@/lib/codes";
import { getAppSettings } from "@/lib/settings";
import { newSpoolSchema, nullify, spoolSchema, usageSchema, weighInSchema } from "@/lib/validation";
import { weighInUsage } from "@/lib/weights";

async function uniqueSpoolCode() {
  for (let i = 0; i < 20; i++) {
    const code = generateSpoolCode();
    const exists = await db.query.spools.findFirst({ where: eq(spools.code, code), columns: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique spool code");
}

export async function createSpoolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = newSpoolSchema.safeParse(formToObject(formData));
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
  revalidatePath("/", "layout");
  redirect(ids.length === 1 ? `/spools/${ids[0]}?created=1` : `/spools?filament=${data.filamentId}`);
}

export async function updateSpoolAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = spoolSchema.safeParse(formToObject(formData));
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
  revalidatePath("/", "layout");
  redirect(`/spools/${id}`);
}

export async function setSpoolStatusAction(id: number, status: SpoolStatus) {
  await requireUser();
  const current = await db.query.spools.findFirst({ where: eq(spools.id, id), columns: { openedAt: true } });
  await db
    .update(spools)
    .set({ status, openedAt: status === "opened" && !current?.openedAt ? new Date() : current?.openedAt })
    .where(eq(spools.id, id));
  revalidatePath("/", "layout");
}

export async function deleteSpoolAction(id: number) {
  await requireUser();
  await db.transaction(async (tx) => {
    await tx.delete(usageLogs).where(eq(usageLogs.spoolId, id));
    await tx.update(filamentNotes).set({ spoolId: null }).where(eq(filamentNotes.spoolId, id));
    await tx.delete(spools).where(eq(spools.id, id));
  });
  revalidatePath("/", "layout");
  redirect("/spools");
}

/** Keeps the spool status in sync with its remaining weight after usage changes. */
async function syncStatus(spoolId: number) {
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

export async function logUsageAction(spoolId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = usageSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  await db.insert(usageLogs).values({
    spoolId,
    grams: parsed.data.grams,
    kind: "print",
    printName: parsed.data.printName ?? null,
    note: parsed.data.note ?? null,
  });
  await syncStatus(spoolId);
  revalidatePath("/", "layout");
  return { ok: true, message: `Logged ${parsed.data.grams} g` };
}

export async function weighInAction(spoolId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = weighInSchema.safeParse(formToObject(formData));
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
  revalidatePath("/", "layout");
  return { ok: true, message: delta > 0 ? `Recorded ${delta} g used` : `Added back ${-delta} g` };
}

export async function deleteUsageAction(usageId: number) {
  await requireUser();
  const row = await db.query.usageLogs.findFirst({ where: eq(usageLogs.id, usageId) });
  if (!row) return;
  await db.delete(usageLogs).where(eq(usageLogs.id, usageId));
  await syncStatus(row.spoolId);
  revalidatePath("/", "layout");
}
