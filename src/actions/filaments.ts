"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject } from "@/lib/action-state";
import {
  addNote,
  createFilament,
  deleteFilament,
  deleteNote,
  setFilamentArchived,
  updateFilament,
} from "@/server/services/filaments";

export async function createFilamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await createFilament(formToObject(formData));
  if (!result.ok) return result;
  revalidatePath("/", "layout");

  const next = formData.get("then");
  redirect(next === "spool" ? `/spools/new?filament=${result.id}` : `/filaments/${result.id}`);
}

export async function updateFilamentAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await updateFilament(id, formToObject(formData));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect(`/filaments/${id}`);
}

export async function setFilamentArchivedAction(id: number, archived: boolean) {
  await requireUser();
  await setFilamentArchived(id, archived);
  revalidatePath("/", "layout");
}

export async function deleteFilamentAction(id: number): Promise<ActionState> {
  await requireUser();
  const result = await deleteFilament(id);
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect("/filaments");
}

export async function addNoteAction(filamentId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await addNote(filamentId, formToObject(formData));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteNoteAction(noteId: number) {
  await requireUser();
  await deleteNote(noteId);
  revalidatePath("/", "layout");
}
