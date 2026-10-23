import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { brands, filaments, materials, spools, usageLogs } from "@/db/schema";

export type FilamentFilters = { q?: string; materialId?: number; brandId?: number; archived?: boolean };

export async function listFilaments(filters: FilamentFilters = {}) {
  const where: SQL[] = [eq(filaments.archived, filters.archived ?? false)];
  if (filters.materialId) where.push(eq(filaments.materialId, filters.materialId));
  if (filters.brandId) where.push(eq(filaments.brandId, filters.brandId));
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push(
      sql`(${filaments.name} like ${term} escape '\\' or ${filaments.colorName} like ${term} escape '\\' or ${brands.name} like ${term} escape '\\' or ${materials.name} like ${term} escape '\\')`,
    );
  }

  const stock = db
    .select({
      filamentId: spools.filamentId,
      spoolCount: sql<number>`count(*)`.as("spool_count"),
      activeCount: sql<number>`sum(case when ${spools.status} in ('sealed','opened') then 1 else 0 end)`.as("active_count"),
      remaining: sql<number>`sum(case when ${spools.status} in ('sealed','opened') then ${spools.initialWeight} - coalesce((select sum(${usageLogs.grams}) from ${usageLogs} where ${usageLogs.spoolId} = ${spools.id}), 0) else 0 end)`.as("remaining"),
    })
    .from(spools)
    .groupBy(spools.filamentId)
    .as("stock");

  return db
    .select({
      id: filaments.id,
      name: filaments.name,
      colorName: filaments.colorName,
      colorHex: filaments.colorHex,
      diameter: filaments.diameter,
      nozzleMin: sql<number | null>`coalesce(${filaments.nozzleMin}, ${materials.nozzleMin})`,
      nozzleMax: sql<number | null>`coalesce(${filaments.nozzleMax}, ${materials.nozzleMax})`,
      bedMin: sql<number | null>`coalesce(${filaments.bedMin}, ${materials.bedMin})`,
      bedMax: sql<number | null>`coalesce(${filaments.bedMax}, ${materials.bedMax})`,
      rating: filaments.rating,
      imageUrl: filaments.imageUrl,
      brandName: brands.name,
      materialName: materials.name,
      spoolCount: sql<number>`coalesce(${stock.spoolCount}, 0)`,
      activeCount: sql<number>`coalesce(${stock.activeCount}, 0)`,
      remaining: sql<number>`coalesce(${stock.remaining}, 0)`,
    })
    .from(filaments)
    .leftJoin(brands, eq(brands.id, filaments.brandId))
    .leftJoin(materials, eq(materials.id, filaments.materialId))
    .leftJoin(stock, eq(stock.filamentId, filaments.id))
    .where(and(...where))
    .orderBy(asc(brands.name), asc(materials.name), asc(filaments.name));
}

export type FilamentListRow = Awaited<ReturnType<typeof listFilaments>>[number];

export async function getFilamentDetail(id: number) {
  return db.query.filaments.findFirst({
    where: eq(filaments.id, id),
    with: {
      brand: true,
      material: true,
      notes: {
        orderBy: (n, { desc }) => [desc(n.createdAt), desc(n.id)],
        with: { spool: { columns: { id: true, code: true } } },
      },
      spools: {
        orderBy: (s, { desc }) => [desc(s.createdAt)],
        with: { vendor: true, usage: { columns: { grams: true, kind: true, createdAt: true } } },
      },
    },
  });
}

export type FilamentDetail = NonNullable<Awaited<ReturnType<typeof getFilamentDetail>>>;

export async function listFilamentOptions() {
  return db
    .select({
      id: filaments.id,
      name: filaments.name,
      colorName: filaments.colorName,
      colorHex: filaments.colorHex,
      brandName: brands.name,
      materialName: materials.name,
      nominalWeight: filaments.nominalWeight,
      spoolWeight: filaments.spoolWeight,
    })
    .from(filaments)
    .leftJoin(brands, eq(brands.id, filaments.brandId))
    .leftJoin(materials, eq(materials.id, filaments.materialId))
    .where(eq(filaments.archived, false))
    .orderBy(asc(brands.name), asc(filaments.name));
}

export type FilamentOption = Awaited<ReturnType<typeof listFilamentOptions>>[number];

export async function findFilamentByGoodsId(goodsId: number) {
  return db.query.filaments.findFirst({
    where: eq(filaments.prusamentGoodsId, goodsId),
    orderBy: desc(filaments.id),
  });
}
