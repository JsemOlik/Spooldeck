import { and, asc, count, desc, eq, inArray, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { brands, filaments, materials, spools, usageLogs, vendors, type SpoolStatus } from "@/db/schema";

const usage = db
  .select({
    spoolId: usageLogs.spoolId,
    used: sql<number>`coalesce(sum(${usageLogs.grams}), 0)`.as("used"),
    lastUsedAt: sql<number | null>`max(case when ${usageLogs.kind} = 'print' then ${usageLogs.createdAt} end)`.as("last_used_at"),
  })
  .from(usageLogs)
  .groupBy(usageLogs.spoolId)
  .as("u");

const remainingExpr = sql<number>`(${spools.initialWeight} - coalesce(${usage.used}, 0))`;

const spoolRowSelect = {
  id: spools.id,
  code: spools.code,
  status: spools.status,
  location: spools.location,
  initialWeight: spools.initialWeight,
  spoolWeight: spools.spoolWeight,
  price: spools.price,
  currency: spools.currency,
  purchaseDate: spools.purchaseDate,
  prusamentSpoolId: spools.prusamentSpoolId,
  createdAt: spools.createdAt,
  used: sql<number>`coalesce(${usage.used}, 0)`,
  remaining: remainingExpr,
  lastUsedAt: usage.lastUsedAt,
  filamentId: filaments.id,
  filamentName: filaments.name,
  colorName: filaments.colorName,
  colorHex: filaments.colorHex,
  diameter: filaments.diameter,
  brandName: brands.name,
  materialName: materials.name,
  density: materials.density,
  vendorName: vendors.name,
};

function baseSpoolQuery() {
  return db
    .select(spoolRowSelect)
    .from(spools)
    .innerJoin(filaments, eq(filaments.id, spools.filamentId))
    .leftJoin(brands, eq(brands.id, filaments.brandId))
    .leftJoin(materials, eq(materials.id, filaments.materialId))
    .leftJoin(vendors, eq(vendors.id, spools.vendorId))
    .leftJoin(usage, eq(usage.spoolId, spools.id));
}

export type SpoolRow = Awaited<ReturnType<typeof baseSpoolQuery>>[number];

export type SpoolFilters = {
  q?: string;
  materialId?: number;
  brandId?: number;
  filamentId?: number;
  status?: SpoolStatus | "active" | "all";
  location?: string;
  sort?: "remaining" | "recent" | "name" | "used";
  lowStockGrams?: number;
};

export async function listSpools(filters: SpoolFilters = {}): Promise<SpoolRow[]> {
  const where: SQL[] = [];
  const status = filters.status ?? "active";
  if (status === "active") where.push(inArray(spools.status, ["sealed", "opened"]));
  else if (status !== "all") where.push(eq(spools.status, status));
  if (filters.materialId) where.push(eq(filaments.materialId, filters.materialId));
  if (filters.brandId) where.push(eq(filaments.brandId, filters.brandId));
  if (filters.filamentId) where.push(eq(spools.filamentId, filters.filamentId));
  if (filters.location) where.push(eq(spools.location, filters.location));
  if (filters.lowStockGrams != null) where.push(sql`${remainingExpr} <= ${filters.lowStockGrams}`);
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const likeEsc = (col: SQLWrapper) => sql`${col} like ${term} escape '\\'`;
    where.push(
      or(
        likeEsc(filaments.name),
        likeEsc(filaments.colorName),
        likeEsc(brands.name),
        likeEsc(materials.name),
        likeEsc(spools.code),
        likeEsc(spools.location),
        likeEsc(spools.notes),
      )!,
    );
  }

  const order = {
    remaining: [asc(remainingExpr)],
    recent: [desc(spools.createdAt)],
    name: [asc(brands.name), asc(filaments.name)],
    used: [sql`${usage.lastUsedAt} desc nulls last`],
  }[filters.sort ?? "name"];

  const rows = await baseSpoolQuery()
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order, asc(spools.id));
  return rows;
}

export async function getSpoolDetail(id: number) {
  const spool = await db.query.spools.findFirst({
    where: eq(spools.id, id),
    with: {
      filament: { with: { brand: true, material: true } },
      vendor: true,
      usage: { orderBy: (u, { desc }) => [desc(u.createdAt), desc(u.id)] },
    },
  });
  if (!spool) return null;
  const used = spool.usage.reduce((sum, u) => sum + u.grams, 0);
  return { ...spool, used, remaining: spool.initialWeight - used };
}

export type SpoolDetail = NonNullable<Awaited<ReturnType<typeof getSpoolDetail>>>;

export async function getSpoolIdByCode(code: string) {
  const row = await db.query.spools.findFirst({ where: eq(spools.code, code), columns: { id: true } });
  return row?.id ?? null;
}

export async function getSpoolIdByPrusamentId(prusamentSpoolId: string) {
  const row = await db.query.spools.findFirst({
    where: eq(spools.prusamentSpoolId, prusamentSpoolId),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export async function getSpoolUsed(spoolId: number) {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${usageLogs.grams}), 0)` })
    .from(usageLogs)
    .where(eq(usageLogs.spoolId, spoolId));
  return row?.used ?? 0;
}

export async function listLocations() {
  const rows = await db
    .selectDistinct({ location: spools.location })
    .from(spools)
    .where(and(sql`${spools.location} is not null`, ne(spools.location, "")))
    .orderBy(asc(spools.location));
  return rows.map((r) => r.location!);
}

export async function getSpoolsForLabels(ids: number[]) {
  if (ids.length === 0) return [];
  return db.query.spools.findMany({
    where: inArray(spools.id, ids),
    with: { filament: { with: { brand: true, material: true } }, vendor: true },
  });
}

export type LabelSpool = Awaited<ReturnType<typeof getSpoolsForLabels>>[number];

export async function listLocationsWithCounts() {
  return db
    .select({ name: sql<string>`${spools.location}`, spools: count(spools.id) })
    .from(spools)
    .where(and(sql`${spools.location} is not null`, ne(spools.location, "")))
    .groupBy(spools.location)
    .orderBy(asc(spools.location));
}
