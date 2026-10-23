import { sql } from "drizzle-orm";
import { db } from ".";
import { materials } from "./schema";

const DEFAULT_MATERIALS: (typeof materials.$inferInsert)[] = [
  { name: "PLA", density: 1.24, nozzleMin: 200, nozzleMax: 225, bedMin: 50, bedMax: 65 },
  { name: "PETG", density: 1.27, nozzleMin: 230, nozzleMax: 250, bedMin: 70, bedMax: 90 },
  { name: "ASA", density: 1.07, nozzleMin: 240, nozzleMax: 270, bedMin: 90, bedMax: 110 },
  { name: "ABS", density: 1.04, nozzleMin: 240, nozzleMax: 260, bedMin: 95, bedMax: 110 },
  { name: "TPU", density: 1.21, nozzleMin: 210, nozzleMax: 240, bedMin: 40, bedMax: 60 },
  { name: "PC", density: 1.2, nozzleMin: 260, nozzleMax: 290, bedMin: 100, bedMax: 115 },
  { name: "PA", density: 1.14, nozzleMin: 250, nozzleMax: 290, bedMin: 80, bedMax: 110 },
  { name: "PVB", density: 1.08, nozzleMin: 200, nozzleMax: 220, bedMin: 60, bedMax: 75 },
  { name: "HIPS", density: 1.04, nozzleMin: 220, nozzleMax: 250, bedMin: 90, bedMax: 110 },
  { name: "PVA", density: 1.23, nozzleMin: 185, nozzleMax: 210, bedMin: 45, bedMax: 60 },
];

export async function seedMaterials() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(materials);
  if (count > 0) return;
  await db.insert(materials).values(DEFAULT_MATERIALS).onConflictDoNothing();
}
