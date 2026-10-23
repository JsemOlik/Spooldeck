import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, filaments, materials, spools, vendors } from "@/db/schema";

export function listBrands() {
  return db.select().from(brands).orderBy(asc(brands.name));
}

export function listMaterials() {
  return db.select().from(materials).orderBy(asc(materials.name));
}

export function listVendors() {
  return db.select().from(vendors).orderBy(asc(vendors.name));
}

export async function listBrandsWithCounts() {
  return db
    .select({ id: brands.id, name: brands.name, website: brands.website, filaments: count(filaments.id) })
    .from(brands)
    .leftJoin(filaments, eq(filaments.brandId, brands.id))
    .groupBy(brands.id)
    .orderBy(asc(brands.name));
}

export async function listMaterialsWithCounts() {
  return db
    .select({
      id: materials.id,
      name: materials.name,
      density: materials.density,
      nozzleMin: materials.nozzleMin,
      nozzleMax: materials.nozzleMax,
      bedMin: materials.bedMin,
      bedMax: materials.bedMax,
      notes: materials.notes,
      filaments: count(filaments.id),
    })
    .from(materials)
    .leftJoin(filaments, eq(filaments.materialId, materials.id))
    .groupBy(materials.id)
    .orderBy(asc(materials.name));
}

export async function listVendorsWithCounts() {
  return db
    .select({ id: vendors.id, name: vendors.name, url: vendors.url, notes: vendors.notes, spools: count(spools.id) })
    .from(vendors)
    .leftJoin(spools, eq(spools.vendorId, vendors.id))
    .groupBy(vendors.id)
    .orderBy(asc(vendors.name));
}

/** Finds a row by case-insensitive name, creating it when missing. */
export async function brandIdByName(name: string | undefined | null) {
  if (!name) return null;
  const existing = await db.query.brands.findFirst({ where: sql`lower(${brands.name}) = lower(${name})` });
  if (existing) return existing.id;
  const [row] = await db.insert(brands).values({ name }).returning({ id: brands.id });
  return row.id;
}

export async function materialIdByName(name: string | undefined | null) {
  if (!name) return null;
  const existing = await db.query.materials.findFirst({ where: sql`lower(${materials.name}) = lower(${name})` });
  if (existing) return existing.id;
  const [row] = await db.insert(materials).values({ name }).returning({ id: materials.id });
  return row.id;
}

export async function vendorIdByName(name: string | undefined | null) {
  if (!name) return null;
  const existing = await db.query.vendors.findFirst({ where: sql`lower(${vendors.name}) = lower(${name})` });
  if (existing) return existing.id;
  const [row] = await db.insert(vendors).values({ name }).returning({ id: vendors.id });
  return row.id;
}
