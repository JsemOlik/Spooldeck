import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export const DATABASE_URL = process.env.DATABASE_URL ?? "file:./data/spooldeck.db";

type Db = LibSQLDatabase<typeof schema> & { $client: Client };

const globalForDb = globalThis as unknown as { __spooldeckDb?: Db };

function createDb(): Db {
  if (DATABASE_URL.startsWith("file:")) {
    mkdirSync(dirname(DATABASE_URL.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url: DATABASE_URL });
  return drizzle(client, { schema });
}

export const db: Db = globalForDb.__spooldeckDb ?? (globalForDb.__spooldeckDb = createDb());

export { schema };
