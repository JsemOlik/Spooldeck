"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject } from "@/lib/action-state";
import { createPrinter, deletePrinter, loadSpool, updatePrinter } from "@/server/services/printers";

export async function savePrinterAction(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { online?: boolean }> {
  await requireUser();
  const input = formToObject(formData);
  const result = id ? await updatePrinter(id, input) : await createPrinter(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function deletePrinterAction(id: number) {
  await requireUser();
  const result = await deletePrinter(id);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function loadSpoolAction(printerId: number, spoolId: number | null, tool = 0) {
  await requireUser();
  const result = await loadSpool(printerId, spoolId, tool);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
