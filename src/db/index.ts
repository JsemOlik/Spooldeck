import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

const globalForDb = globalThis as unknown as { __spooldeckDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Point it at your PostgreSQL database, e.g. postgres://user:pass@localhost:5432/spooldeck");
  }
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX) || 10, onnotice: () => {} });
  return drizzle(client, { schema });
}

// Reused across hot reloads in dev so each edit doesn't open a new pool.
function getDb(): Db {
  return (globalForDb.__spooldeckDb ??= createDb());
}

/**
 * Created on first use rather than on import: `next build` loads route modules without a
 * database, and a missing DATABASE_URL should only fail once something actually queries.
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
