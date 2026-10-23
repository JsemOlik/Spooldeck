"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject } from "@/lib/action-state";
import {
  type CatalogKind,
  deleteCatalogItem,
  renameLocation,
  saveCatalogItem,
  saveSettings,
} from "@/server/services/settings";

export type { CatalogKind };

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await saveSettings(formToObject(formData));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function saveCatalogItemAction(
  kind: CatalogKind,
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const result = await saveCatalogItem(kind, id, formToObject(formData));
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCatalogItemAction(kind: CatalogKind, id: number) {
  await requireUser();
  await deleteCatalogItem(kind, id);
  revalidatePath("/", "layout");
}

export async function renameLocationAction(from: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await renameLocation(from, formToObject(formData));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
