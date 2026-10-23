"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { filamentNotes, filaments, spools } from "@/db/schema";
import { brandIdByName, materialIdByName } from "@/db/queries/catalog";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject, fromZodError } from "@/lib/action-state";
import { type FilamentInput, filamentSchema, noteSchema, nullify } from "@/lib/validation";

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

export async function createFilamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = filamentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const [row] = await db
    .insert(filaments)
    .values(await toFilamentValues(parsed.data))
    .returning({ id: filaments.id });
  revalidatePath("/", "layout");

  const next = formData.get("then");
  redirect(next === "spool" ? `/spools/new?filament=${row.id}` : `/filaments/${row.id}`);
}

export async function updateFilamentAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = filamentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  await db.update(filaments).set(await toFilamentValues(parsed.data)).where(eq(filaments.id, id));
  revalidatePath("/", "layout");
  redirect(`/filaments/${id}`);
}

export async function setFilamentArchivedAction(id: number, archived: boolean) {
  await requireUser();
  await db.update(filaments).set({ archived }).where(eq(filaments.id, id));
  revalidatePath("/", "layout");
}

export async function deleteFilamentAction(id: number): Promise<ActionState> {
  await requireUser();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(spools)
    .where(eq(spools.filamentId, id));
  if (count > 0) return { error: "This filament still has spools. Delete or move them first, or archive it." };
  await db.delete(filamentNotes).where(eq(filamentNotes.filamentId, id));
  await db.delete(filaments).where(eq(filaments.id, id));
  revalidatePath("/", "layout");
  redirect("/filaments");
}

export async function addNoteAction(filamentId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = noteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  await db.insert(filamentNotes).values({ filamentId, body: parsed.data.body, spoolId: parsed.data.spoolId ?? null });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteNoteAction(noteId: number) {
  await requireUser();
  await db.delete(filamentNotes).where(eq(filamentNotes.id, noteId));
  revalidatePath("/", "layout");
}
