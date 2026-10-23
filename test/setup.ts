import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every test run gets its own throwaway SQLite file; must be set before "@/db" is imported.
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "spooldeck-test-")), "test.db")}`;
