"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { labelTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { labelConfigSchema, type LabelConfig } from "@/lib/labels/config";

const nameSchema = z.string().trim().min(1, "Give the template a name").max(100);

export async function saveLabelTemplateAction(
  id: number | null,
  name: string,
  config: LabelConfig,
): Promise<{ id?: number; error?: string }> {
  await requireUser();
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: parsedName.error.issues[0].message };
  const parsed = labelConfigSchema.safeParse(config);
  if (!parsed.success) return { error: "Invalid label settings" };
  const values = {
    name: parsedName.data,
    widthMm: parsed.data.widthMm,
    heightMm: parsed.data.heightMm,
    layout: parsed.data.layout,
    sheet: parsed.data.sheet,
  };
  let savedId = id;
  if (id) {
    await db.update(labelTemplates).set(values).where(eq(labelTemplates.id, id));
  } else {
    const [row] = await db.insert(labelTemplates).values(values).returning({ id: labelTemplates.id });
    savedId = row.id;
  }
  revalidatePath("/labels");
  return { id: savedId! };
}

export async function deleteLabelTemplateAction(id: number) {
  await requireUser();
  await db.delete(labelTemplates).where(eq(labelTemplates.id, id));
  revalidatePath("/labels");
}

export async function setDefaultLabelTemplateAction(id: number) {
  await requireUser();
  await db.transaction(async (tx) => {
    await tx.update(labelTemplates).set({ isDefault: false });
    await tx.update(labelTemplates).set({ isDefault: true }).where(eq(labelTemplates.id, id));
  });
  revalidatePath("/labels");
}
