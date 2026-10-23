import { randomInt } from "node:crypto";
import { join } from "node:path";
import { count, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from ".";
import { users } from "./schema";
import { seedMaterials } from "./seed";
import { setSetting } from "@/lib/settings";

const SETUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSetupCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += SETUP_CODE_ALPHABET[randomInt(SETUP_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Errors that won't fix themselves by waiting: wrong password, missing database or role. */
const FATAL_CODES = new Set(["28P01", "28000", "3D000"]);

/** Postgres may still be starting (e.g. a fresh container); wait up to a minute before giving up. */
async function waitForDatabase() {
  let lastReason = "";
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql`select 1`);
      if (attempt > 1) console.log("Connected to the database.");
      return;
    } catch (err) {
      if (!process.env.DATABASE_URL) throw err;
      if (err instanceof URIError) {
        console.error(
          "DATABASE_URL isn't a valid URL. Percent-encode special characters in the password, or leave the password out of the URL and set PGPASSWORD instead.",
        );
        throw err;
      }
      const cause = ((err as { cause?: unknown }).cause ?? err) as { code?: string; message?: string };
      const reason = [cause.code, cause.message].filter(Boolean).join(": ");
      if (FATAL_CODES.has(cause.code ?? "")) {
        console.error(`Can't connect to the database (${reason}). Check DATABASE_URL and the Postgres credentials.`);
        throw err;
      }
      if (attempt >= 30) {
        console.error(`Gave up waiting for the database (${reason}).`);
        throw err;
      }
      if (reason !== lastReason) console.log(`Waiting for the database (${reason})…`);
      lastReason = reason;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function bootstrap() {
  await waitForDatabase();
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  await seedMaterials();

  const [{ accounts }] = await db.select({ accounts: count() }).from(users);
  if (accounts === 0) {
    const code = generateSetupCode();
    await setSetting("setup_code", code);
    console.log(
      [
        "",
        "┌──────────────────────────────────────────────┐",
        "│ Spooldeck has no account yet.                │",
        `│ Open /setup and enter setup code: ${code}  │`,
        "└──────────────────────────────────────────────┘",
        "",
      ].join("\n"),
    );
  }
}
