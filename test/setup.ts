import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// Every test run gets its own throwaway in-memory Postgres (PGlite) behind a real socket, so the
// app's postgres.js client is exercised as-is. Must be set up before "@/db" is imported.
const pg = await PGlite.create();
const server = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 10 });
await server.start();
process.env.DATABASE_URL = `postgres://postgres@${server.getServerConn()}/postgres`;
// PGlite runs one query at a time, and queries from parallel connections can get mixed up.
process.env.DATABASE_POOL_MAX = "1";
// No teardown: preload hooks run per test file, and the process exit closes everything.

