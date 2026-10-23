import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  currency: string;
  lowStockGrams: number;
  publicUrl: string;
};

const DEFAULTS: AppSettings = {
  currency: "EUR",
  lowStockGrams: 150,
  publicUrl: "",
};

const KEYS = ["currency", "lowStockGrams", "publicUrl"] as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function deleteSetting(key: string) {
  await db.delete(settings).where(eq(settings.key, key));
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const lowStock = Number(map.get("lowStockGrams"));
  return {
    currency: map.get("currency") || DEFAULTS.currency,
    lowStockGrams: Number.isFinite(lowStock) && map.has("lowStockGrams") ? lowStock : DEFAULTS.lowStockGrams,
    publicUrl: map.get("publicUrl") || process.env.PUBLIC_URL || DEFAULTS.publicUrl,
  };
}
