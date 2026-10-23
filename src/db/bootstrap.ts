import { randomInt } from "node:crypto";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
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

export async function bootstrap() {
  await db.run(sql`PRAGMA journal_mode = WAL`);
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  await seedMaterials();

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  if (count === 0) {
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
