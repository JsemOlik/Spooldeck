/**
 * Copies everything, including the login, from a Spooldeck SQLite database (versions before the
 * move to PostgreSQL) into the PostgreSQL database in DATABASE_URL.
 *
 *   bun run import-sqlite ./data/spooldeck.db       # local checkout
 *   docker compose exec spooldeck bun import-sqlite.js /old-data/spooldeck.db
 *
 * The target must not have an account or any filaments yet. Sessions aren't copied, so you sign in again.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { count, eq, getTableColumns, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import { BackupError, restoreBackup, type Backup } from "../src/lib/backup";

const file = process.argv[2] ?? "./data/spooldeck.db";
if (!existsSync(file)) {
  console.error(`No SQLite database at ${file}. Pass its path: bun run import-sqlite <file>`);
  process.exit(1);
}

const sqlite = new Database(file, { readonly: true });
const sqliteTables = new Set(
  sqlite.query<{ name: string }, []>("select name from sqlite_master where type = 'table'").all().map((t) => t.name),
);

/** Reads a table and converts SQLite's storage (ms timestamps, 0/1, JSON text) to the Postgres schema's types. */
function readTable(table: PgTable, name: string) {
  if (!sqliteTables.has(name)) return [];
  const columns = Object.entries(getTableColumns(table));
  return sqlite
    .query<Record<string, unknown>, []>(`select * from "${name}"`)
    .all()
    .map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, col] of columns) {
        const value = row[col.name];
        if (value === undefined) continue;
        if (value === null) out[key] = null;
        else if (col.dataType === "date") out[key] = new Date(value as number).toISOString();
        else if (col.dataType === "boolean") out[key] = Boolean(value);
        else if (col.dataType === "json") out[key] = typeof value === "string" ? JSON.parse(value) : value;
        else out[key] = value;
      }
      return out;
    });
}

await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

const [{ accounts }] = await db.select({ accounts: count() }).from(schema.users);
const [{ filamentCount }] = await db.select({ filamentCount: count() }).from(schema.filaments);
if (accounts > 0 || filamentCount > 0) {
  console.error("The PostgreSQL database already has an account or filaments. Import into an empty database.");
  process.exit(1);
}

// Everything but the login goes through the regular backup restore, which validates every row.
const backup: Backup = {
  app: "spooldeck",
  version: 1,
  exportedAt: new Date().toISOString(),
  data: {
    brands: readTable(schema.brands, "brands"),
    vendors: readTable(schema.vendors, "vendors"),
    materials: readTable(schema.materials, "materials"),
    filaments: readTable(schema.filaments, "filaments"),
    spools: readTable(schema.spools, "spools"),
    usageLogs: readTable(schema.usageLogs, "usage_logs"),
    filamentNotes: readTable(schema.filamentNotes, "filament_notes"),
    labelTemplates: readTable(schema.labelTemplates, "label_templates"),
    settings: readTable(schema.settings, "settings").filter((s) => s.key !== "setup_code"),
  } as Backup["data"],
};

let counts: Record<string, number>;
try {
  counts = await restoreBackup(backup);
} catch (err) {
  console.error(err instanceof BackupError ? `Import failed: ${err.message}` : err);
  process.exit(1);
}

const users = readTable(schema.users, "users").map((u) => ({
  ...u,
  createdAt: new Date(u.createdAt as string),
  updatedAt: new Date(u.updatedAt as string),
})) as (typeof schema.users.$inferInsert)[];
if (users.length) {
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values(users);
    await tx.execute(sql`select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from users) + 1, false)`);
    await tx.delete(schema.settings).where(eq(schema.settings.key, "setup_code"));
  });
}

sqlite.close();
await db.$client.end();

const summary = Object.entries({ ...counts, users: users.length })
  .filter(([, n]) => n > 0)
  .map(([table, n]) => `${table} ${n}`)
  .join(", ");
console.log(`Imported from ${file}: ${summary || "nothing (the file was empty)"}.`);
if (users.length) console.log(`Sign in with your existing username and password.`);
