"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { db } from "@/db";
import { brands, filaments, materials, spools, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject, fromZodError } from "@/lib/action-state";
import { deleteSetting, setSetting } from "@/lib/settings";
import { appSettingsSchema, brandSchema, materialSchema, nullify, vendorSchema } from "@/lib/validation";

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = appSettingsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  await setSetting("currency", parsed.data.currency);
  await setSetting("lowStockGrams", String(parsed.data.lowStockGrams));
  if (parsed.data.publicUrl) await setSetting("publicUrl", parsed.data.publicUrl);
  else await deleteSetting("publicUrl");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

// ---------------------------------------------------------------------------
// Catalog: brands, vendors, materials
// ---------------------------------------------------------------------------

const CATALOG = {
  brands: { table: brands, schema: brandSchema },
  vendors: { table: vendors, schema: vendorSchema },
  materials: { table: materials, schema: materialSchema },
} as const;
export type CatalogKind = keyof typeof CATALOG;

export async function saveCatalogItemAction(
  kind: CatalogKind,
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const { table, schema } = CATALOG[kind];
  const parsed = (schema as z.ZodType<{ name: string }>).safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const values = nullify(parsed.data as Record<string, unknown>) as { name: string };

  const clash = await db
    .select({ id: table.id })
    .from(table)
    .where(and(sql`lower(${table.name}) = lower(${values.name})`, id ? ne(table.id, id) : undefined))
    .limit(1);
  if (clash.length) return { fieldErrors: { name: [`“${values.name}” already exists`] } };

  if (id) await db.update(table).set(values).where(eq(table.id, id));
  else await db.insert(table).values(values as never);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCatalogItemAction(kind: CatalogKind, id: number) {
  await requireUser();
  await db.transaction(async (tx) => {
    // Foreign keys aren't enforced by SQLite here, so detach references by hand.
    if (kind === "brands") await tx.update(filaments).set({ brandId: null }).where(eq(filaments.brandId, id));
    if (kind === "materials") await tx.update(filaments).set({ materialId: null }).where(eq(filaments.materialId, id));
    if (kind === "vendors") await tx.update(spools).set({ vendorId: null }).where(eq(spools.vendorId, id));
    const { table } = CATALOG[kind];
    await tx.delete(table).where(eq(table.id, id));
  });
  revalidatePath("/", "layout");
}

export async function renameLocationAction(from: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const to = formToObject(formData).name ?? null;
  if (to && to.length > 100) return { fieldErrors: { name: ["At most 100 characters"] } };
  await db.update(spools).set({ location: to }).where(eq(spools.location, from));
  revalidatePath("/", "layout");
  return { ok: true };
}
