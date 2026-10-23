import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";
import { brands, filaments, spools, usageLogs } from "@/db/schema";
import { listFilaments } from "@/db/queries/filaments";
import { listSpools } from "@/db/queries/spools";
import { BackupError, exportBackup, restoreBackup } from "@/lib/backup";

const backup = {
  app: "spooldeck",
  version: 1,
  exportedAt: "2026-10-01T00:00:00.000Z",
  data: {
    brands: [{ id: 7, name: "Prusament", website: null, createdAt: "2026-09-01T10:00:00.000Z" }],
    vendors: [],
    materials: [{ id: 3, name: "PLA", density: 1.24, createdAt: "2026-09-01T10:00:00.000Z" }],
    filaments: [{ id: 12, brandId: 7, materialId: 3, name: "Prusament PLA Galaxy Black", colorName: "Galaxy Black", archived: false }],
    spools: [
      { id: 40, filamentId: 12, code: "AAAA11", initialWeight: 1000, price: 24.99, status: "opened" },
      { id: 41, filamentId: 12, code: "BBBB22", initialWeight: 1000, status: "sealed" },
    ],
    usageLogs: [{ id: 90, spoolId: 40, grams: 120.5, kind: "print", createdAt: "2026-09-20T12:00:00.000Z" }],
    filamentNotes: [],
    labelTemplates: [{ id: 2, name: "Shelf", widthMm: 50, heightMm: 30, layout: { qrPosition: "left" }, sheet: null, isDefault: true }],
    settings: [{ key: "currency", value: "EUR" }],
  },
};

describe("postgres data layer", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  });

  test("restores a backup, keeping ids and moving sequences past them", async () => {
    const counts = await restoreBackup(backup);
    expect(counts).toMatchObject({ brands: 1, filaments: 1, spools: 2, usageLogs: 1, labelTemplates: 1 });

    const [brand] = await db.insert(brands).values({ name: "Polymaker" }).returning({ id: brands.id });
    expect(brand.id).toBe(8);
    const [log] = await db.insert(usageLogs).values({ spoolId: 41, grams: 10 }).returning({ id: usageLogs.id });
    expect(log.id).toBe(91);

    const exported = await exportBackup();
    expect(exported.data.labelTemplates[0].layout).toEqual({ qrPosition: "left" });
    expect(exported.data.usageLogs.find((u) => u.id === 90)?.createdAt).toEqual(new Date("2026-09-20T12:00:00.000Z"));
  });

  test("aggregates come back as numbers, not bigint strings", async () => {
    const rows = await listSpools({ status: "all" });
    const opened = rows.find((r) => r.code === "AAAA11")!;
    expect(opened.used).toBe(120.5);
    expect(opened.remaining).toBe(879.5);
    expect(opened.lastUsedAt).toEqual(new Date("2026-09-20T12:00:00.000Z"));

    const [f] = await listFilaments();
    expect(f.spoolCount).toBe(2);
    expect(f.activeCount).toBe(2);
    expect(f.remaining).toBe(879.5 + 990);
  });

  test("search is case-insensitive and treats % literally", async () => {
    expect((await listSpools({ status: "all", q: "galaxy" })).length).toBe(2);
    expect((await listFilaments({ q: "PRUSAMENT" })).length).toBe(1);
    expect((await listSpools({ status: "all", q: "100%" })).length).toBe(0);
  });

  test("broken references are reported, and nothing is replaced", async () => {
    const orphan = structuredClone(backup);
    orphan.data.spools.push({ id: 42, filamentId: 999, code: "CCCC33", initialWeight: 1000, status: "sealed" });
    let error: unknown;
    try {
      await restoreBackup(orphan);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BackupError);
    expect(await db.$count(spools)).toBe(2);
    expect(await db.$count(filaments)).toBe(1);
  });
});
