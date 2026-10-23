import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, filaments, materials, spools, usageLogs } from "@/db/schema";
import { listSpools } from "./spools";

export async function getDashboard(lowStockGrams: number, currency: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [active, recent, byMaterial, [totals]] = await Promise.all([
    listSpools({ status: "active", sort: "remaining" }),
    db
      .select({
        id: usageLogs.id,
        grams: usageLogs.grams,
        kind: usageLogs.kind,
        printName: usageLogs.printName,
        createdAt: usageLogs.createdAt,
        spoolId: spools.id,
        code: spools.code,
        colorName: filaments.colorName,
        filamentName: filaments.name,
        colorHex: filaments.colorHex,
        materialName: materials.name,
        brandName: brands.name,
      })
      .from(usageLogs)
      .innerJoin(spools, eq(spools.id, usageLogs.spoolId))
      .innerJoin(filaments, eq(filaments.id, spools.filamentId))
      .leftJoin(materials, eq(materials.id, filaments.materialId))
      .leftJoin(brands, eq(brands.id, filaments.brandId))
      .where(eq(usageLogs.kind, "print"))
      .orderBy(desc(usageLogs.createdAt), desc(usageLogs.id))
      .limit(8),
    db
      .select({
        material: sql<string>`coalesce(${materials.name}, 'Other')`,
        grams: sql<number>`sum(${usageLogs.grams})`,
      })
      .from(usageLogs)
      .innerJoin(spools, eq(spools.id, usageLogs.spoolId))
      .innerJoin(filaments, eq(filaments.id, spools.filamentId))
      .leftJoin(materials, eq(materials.id, filaments.materialId))
      .where(and(eq(usageLogs.kind, "print"), gte(usageLogs.createdAt, since)))
      .groupBy(materials.name)
      .orderBy(desc(sql`sum(${usageLogs.grams})`)),
    db
      .select({
        prints30: sql<number>`count(*)`,
        used30: sql<number>`coalesce(sum(${usageLogs.grams}), 0)`,
      })
      .from(usageLogs)
      .where(and(eq(usageLogs.kind, "print"), gte(usageLogs.createdAt, since))),
  ]);

  const remaining = active.reduce((s, x) => s + Math.max(0, x.remaining), 0);
  const value = active.reduce((s, x) => {
    if (x.price == null || (x.currency ?? currency) !== currency) return s;
    return s + (x.price / x.initialWeight) * Math.max(0, x.remaining);
  }, 0);
  const low = active.filter((s) => s.remaining <= lowStockGrams);

  return {
    spoolCount: active.length,
    remaining,
    value,
    low,
    recent,
    byMaterial,
    prints30: totals?.prints30 ?? 0,
    used30: totals?.used30 ?? 0,
  };
}
