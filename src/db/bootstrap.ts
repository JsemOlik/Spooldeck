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

/** Postgres may still be starting (e.g. a fresh container); wait up to a minute before giving up. */
async function waitForDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql`select 1`);
      return;
    } catch (err) {
      if (attempt >= 30 || !process.env.DATABASE_URL) throw err;
      if (attempt === 1) console.log("Waiting for the database…");
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
