import { getTableColumns, getTableName, ne, sql, type InferInsertModel } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  brands,
  filamentNotes,
  filaments,
  labelTemplates,
  materials,
  printerSpools,
  printers,
  settings,
  spools,
  usageLogs,
  vendors,
} from "@/db/schema";

export const BACKUP_VERSION = 1;

// Insert order (parents first). Users and sessions are never exported.
const TABLES = {
  brands,
  vendors,
  materials,
  filaments,
  spools,
  usageLogs,
  printers,
  printerSpools,
  filamentNotes,
  labelTemplates,
  settings,
} as const satisfies Record<string, PgTable>;
type TableName = keyof typeof TABLES;

export type Backup = {
  app: "spooldeck";
  version: number;
  exportedAt: string;
  data: { [K in TableName]: InferInsertModel<(typeof TABLES)[K]>[] };
};

export async function exportBackup(): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  for (const name of Object.keys(TABLES) as TableName[]) {
    data[name] =
      name === "settings"
        ? await db.select().from(settings).where(ne(settings.key, "setup_code"))
        : await db.select().from(TABLES[name] as PgTable);
  }
  return { app: "spooldeck", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data } as Backup;
}

export class BackupError extends Error {}

/** Checks each row against the table's columns and converts JSON values back to column types. */
function coerceRows(name: TableName, rows: unknown): Record<string, unknown>[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) throw new BackupError(`“${name}” must be a list`);
  const columns = getTableColumns(TABLES[name] as PgTable);
  return rows.map((row, i) => {
    if (!row || typeof row !== "object") throw new BackupError(`${name}[${i}] is not an object`);
    const out: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(columns)) {
      const value = (row as Record<string, unknown>)[key];
      const where = `${name}[${i}].${key}`;
      if (value === undefined || value === null) {
        if (col.notNull && !col.hasDefault) throw new BackupError(`${where} is required`);
        if (value === null) out[key] = null;
        continue;
      }
      switch (col.dataType) {
        case "date": {
          const d = new Date(value as string | number);
          if (Number.isNaN(d.getTime())) throw new BackupError(`${where} is not a valid date`);
          out[key] = d;
          break;
        }
        case "number":
          if (typeof value !== "number" || !Number.isFinite(value)) throw new BackupError(`${where} must be a number`);
          out[key] = value;
          break;
        case "boolean":
          if (typeof value !== "boolean") throw new BackupError(`${where} must be true or false`);
          out[key] = value;
          break;
        case "string":
          if (typeof value !== "string") throw new BackupError(`${where} must be text`);
          if ("enumValues" in col && Array.isArray(col.enumValues) && col.enumValues.length && !col.enumValues.includes(value)) {
            throw new BackupError(`${where} has an unknown value “${value}”`);
          }
          out[key] = value;
          break;
        default:
          out[key] = value;
      }
    }
    return out;
  });
}

export function parseBackup(json: unknown) {
  if (!json || typeof json !== "object" || (json as Backup).app !== "spooldeck") {
    throw new BackupError("This isn't a Spooldeck backup file.");
  }
  const backup = json as Backup;
  if (typeof backup.version !== "number" || backup.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of Spooldeck.");
  }
  if (!backup.data || typeof backup.data !== "object") throw new BackupError("The backup has no data.");
  const parsed = {} as Record<TableName, Record<string, unknown>[]>;
  for (const name of Object.keys(TABLES) as TableName[]) {
    parsed[name] = coerceRows(name, (backup.data as Record<string, unknown>)[name]);
  }
  return parsed;
}

/** The Postgres error behind a failed query, if there is one (drizzle wraps it). */
function pgError(err: unknown): { code?: string; detail?: string; table_name?: string } | null {
  for (let e = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ("code" in e && typeof e.code === "string") return e as never;
  }
  return null;
}

/** Replaces all inventory data with the backup's contents in one transaction. Returns row counts. */
export async function restoreBackup(json: unknown) {
  const data = parseBackup(json);
  const names = Object.keys(TABLES) as TableName[];
  try {
    await db.transaction(async (tx) => {
      for (const name of [...names].reverse()) {
        if (name === "settings") await tx.delete(settings).where(ne(settings.key, "setup_code"));
        else await tx.delete(TABLES[name] as PgTable);
      }
      for (const name of names) {
        const rows = data[name];
        for (let i = 0; i < rows.length; i += 200) {
          await tx.insert(TABLES[name] as PgTable).values(rows.slice(i, i + 200) as never);
        }
        // Rows keep their ids, so move the id sequence past them for the next insert.
        if (name !== "settings") {
          const table = getTableName(TABLES[name]);
          await tx.execute(
            sql`select setval(pg_get_serial_sequence(${table}, 'id'), coalesce((select max(id) from ${sql.identifier(table)}), 0) + 1, false)`,
          );
        }
      }
    });
  } catch (err) {
    const pg = pgError(err);
    if (pg?.code === "23503" || pg?.code === "23505") {
      throw new BackupError(`The backup's data doesn't fit together (${pg.table_name ?? "unknown table"}): ${pg.detail ?? "constraint failed"}`);
    }
    throw err;
  }
  return Object.fromEntries(names.map((n) => [n, data[n].length])) as Record<TableName, number>;
}
