"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { type ActionState, formToObject } from "@/lib/action-state";
import { importPrusament, resolveScan } from "@/server/services/scan";

export type ScanResult = { href: string } | { error: string; text?: string };

export async function resolveScanAction(text: string, openLog: boolean): Promise<ScanResult> {
  await requireUser();
  const result = await resolveScan(text);
  if (result.kind === "spool") return { href: `/spools/${result.id}${openLog ? "?scanned=1" : ""}` };
  if (result.kind === "printer") return { href: `/printers/${result.id}` };
  if (result.kind === "prusament") return { href: `/scan/prusament?u=${encodeURIComponent(result.url)}` };
  return { error: result.error, text: result.text };
}

export async function importPrusamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const result = await importPrusament(formToObject(formData));
  if (!result.ok) return result;
  if (result.existing) redirect(`/spools/${result.id}`);
  revalidatePath("/", "layout");
  redirect(`/spools/${result.id}?created=1`);
}
