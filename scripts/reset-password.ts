/**
 * Sets a new random password for the Spooldeck account and signs out every session.
 *
 *   bun run reset-password            # local checkout
 *   docker compose exec spooldeck bun reset-password.js
 *
 * Pass a username to create the account when none exists yet.
 */
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../src/db";
import { sessions, settings, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

const password = randomBytes(12).toString("base64url");
const wantedName = process.argv[2];

const existing = await db.query.users.findFirst();
let username: string;
let summary: string;
if (existing) {
  username = existing.username;
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, existing.id));
  await db.delete(sessions);
  summary = `Password reset for "${username}". All sessions were signed out.`;
} else if (wantedName) {
  username = wantedName;
  await db.insert(users).values({ username, passwordHash: await hashPassword(password) });
  await db.delete(settings).where(eq(settings.key, "setup_code"));
  summary = `Created account "${username}".`;
} else {
  console.error("No account exists yet. Open /setup (the setup code is in the server logs) or pass a username.");
  process.exit(1);
}

console.log(`${summary}\nNew password: ${password}\nChange it under Settings after logging in.`);
