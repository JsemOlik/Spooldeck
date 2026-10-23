import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { filamentNotes, filaments, spools } from "@/db/schema";
import { brandIdByName, materialIdByName } from "@/db/queries/catalog";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { type FilamentInput, filamentSchema, noteSchema, nullify } from "@/lib/validation";
import type { Input } from "./spools";

async function toFilamentValues(input: FilamentInput) {
  const { brand, material, ...rest } = input;
  return {
    ...nullify(rest),
    diameter: rest.diameter ?? 1.75,
    nominalWeight: rest.nominalWeight ?? 1000,
    brandId: await brandIdByName(brand),
    materialId: await materialIdByName(material),
  };
}

export async function createFilament(input: Input): Promise<ActionState & { id?: number }> {
  const parsed = filamentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const [row] = await db
    .insert(filaments)
    .values(await toFilamentValues(parsed.data))
    .returning({ id: filaments.id });
  return { ok: true, id: row.id };
}

export async function updateFilament(id: number, input: Input): Promise<ActionState> {
  const parsed = filamentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  await db.update(filaments).set(await toFilamentValues(parsed.data)).where(eq(filaments.id, id));
  return { ok: true };
}

export async function setFilamentArchived(id: number, archived: boolean) {
  await db.update(filaments).set({ archived }).where(eq(filaments.id, id));
}

export async function deleteFilament(id: number): Promise<ActionState> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(spools)
    .where(eq(spools.filamentId, id));
  if (count > 0) return { error: "This filament still has spools. Delete or move them first, or archive it." };
  await db.delete(filamentNotes).where(eq(filamentNotes.filamentId, id));
  await db.delete(filaments).where(eq(filaments.id, id));
  return { ok: true };
}

export async function addNote(filamentId: number, input: Input): Promise<ActionState & { id?: number }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const [row] = await db
    .insert(filamentNotes)
    .values({ filamentId, body: parsed.data.body, spoolId: parsed.data.spoolId ?? null })
    .returning({ id: filamentNotes.id });
  return { ok: true, id: row.id };
}

export async function deleteNote(noteId: number) {
  await db.delete(filamentNotes).where(eq(filamentNotes.id, noteId));
}
