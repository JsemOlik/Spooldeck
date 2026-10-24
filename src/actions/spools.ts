"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SpoolStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject } from "@/lib/action-state";
import {
  createSpools,
  deleteSpool,
  deleteUsage,
  logPrint,
  logUsage,
  setSpoolStatus,
  updateSpool,
  weighIn,
} from "@/server/services/spools";

export async function createSpoolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await createSpools(formToObject(formData));
  if (!result.ok || !result.ids) return result;
  revalidatePath("/", "layout");
  redirect(result.ids.length === 1 ? `/spools/${result.ids[0]}?created=1` : `/spools?filament=${result.filamentId}`);
}

export async function updateSpoolAction(id: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await updateSpool(id, formToObject(formData));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  redirect(`/spools/${id}`);
}

export async function setSpoolStatusAction(id: number, status: SpoolStatus) {
  await requireUser();
  await setSpoolStatus(id, status);
  revalidatePath("/", "layout");
}

export async function deleteSpoolAction(id: number) {
  await requireUser();
  await deleteSpool(id);
  revalidatePath("/", "layout");
  redirect("/spools");
}

export async function logUsageAction(spoolId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await logUsage(spoolId, formToObject(formData));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function weighInAction(spoolId: number, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await weighIn(spoolId, formToObject(formData));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function deleteUsageAction(usageId: number) {
  await requireUser();
  if (await deleteUsage(usageId)) revalidatePath("/", "layout");
}

export async function logPrintAction(input: {
  printName?: string;
  note?: string;
  usage: { spoolId: number; grams: number }[];
}): Promise<ActionState> {
  await requireUser();
  const result = await logPrint(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
