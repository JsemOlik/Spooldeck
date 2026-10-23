import { and, eq, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { brands, materials, spools, vendors } from "@/db/schema";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { deleteSetting, setSetting } from "@/lib/settings";
import { appSettingsSchema, brandSchema, materialSchema, nullify, vendorSchema } from "@/lib/validation";
import type { Input } from "./spools";

export async function saveSettings(input: Input): Promise<ActionState> {
  const parsed = appSettingsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  await setSetting("currency", parsed.data.currency);
  await setSetting("lowStockGrams", String(parsed.data.lowStockGrams));
  if (parsed.data.publicUrl) await setSetting("publicUrl", parsed.data.publicUrl);
  else await deleteSetting("publicUrl");
  return { ok: true, message: "Settings saved" };
}

const CATALOG = {
  brands: { table: brands, schema: brandSchema },
  vendors: { table: vendors, schema: vendorSchema },
  materials: { table: materials, schema: materialSchema },
} as const;
export type CatalogKind = keyof typeof CATALOG;
export const CATALOG_KINDS = Object.keys(CATALOG) as CatalogKind[];

export async function saveCatalogItem(kind: CatalogKind, id: number | null, input: Input): Promise<ActionState & { id?: number }> {
  const { table, schema } = CATALOG[kind];
  const parsed = (schema as z.ZodType<{ name: string }>).safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const values = nullify(parsed.data as Record<string, unknown>) as { name: string };

  const clash = await db
    .select({ id: table.id })
    .from(table)
    .where(and(sql`lower(${table.name}) = lower(${values.name})`, id ? ne(table.id, id) : undefined))
    .limit(1);
  if (clash.length) return { fieldErrors: { name: [`“${values.name}” already exists`] } };

  if (id) {
    await db.update(table).set(values).where(eq(table.id, id));
    return { ok: true, id };
  }
  const [row] = await db.insert(table).values(values as never).returning({ id: table.id });
  return { ok: true, id: row.id };
}

export async function deleteCatalogItem(kind: CatalogKind, id: number) {
  // The foreign keys are ON DELETE SET NULL, so filaments and spools just lose the reference.
  const { table } = CATALOG[kind];
  await db.delete(table).where(eq(table.id, id));
}

export async function renameLocation(from: string, input: Input): Promise<ActionState> {
  const to = input.name ?? null;
  if (to && to.length > 100) return { fieldErrors: { name: ["At most 100 characters"] } };
  await db.update(spools).set({ location: to }).where(eq(spools.location, from));
  return { ok: true };
}
