import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/rate-limit";
import {
  createSession,
  hashToken,
  invalidateUserSessions,
  SESSION_TTL_MS,
  validateSessionToken,
} from "@/lib/auth/session";

describe("password hashing", () => {
  test("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toStartWith("scrypt$");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  test("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  test("rejects malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$1$1$$")).toBe(false);
  });
});

describe("sessions", () => {
  let userId: number;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
    const [u] = await db.insert(users).values({ username: "tester", passwordHash: "x" }).returning({ id: users.id });
    userId = u.id;
  });

  test("only the token's hash is stored", async () => {
    const { token } = await createSession(userId, "test");
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, token) })).toBeUndefined();
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, hashToken(token)) })).toBeDefined();
  });

  test("a valid token resolves to its user", async () => {
    const { token } = await createSession(userId, null);
    expect(await validateSessionToken(token)).toMatchObject({ id: userId, username: "tester" });
    expect(await validateSessionToken(`${token}x`)).toBeNull();
  });

  test("expired sessions are rejected and deleted", async () => {
    const { token } = await createSession(userId, null);
    expect(await validateSessionToken(token, Date.now() + SESSION_TTL_MS + 1000)).toBeNull();
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, hashToken(token)) })).toBeUndefined();
  });

  test("sessions slide forward when used late in their life", async () => {
    const { token, expiresAt } = await createSession(userId, null);
    const later = Date.now() + SESSION_TTL_MS - 24 * 60 * 60 * 1000; // one day before expiry
    expect(await validateSessionToken(token, later)).not.toBeNull();
    const row = await db.query.sessions.findFirst({ where: eq(sessions.id, hashToken(token)) });
    expect(row!.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());
  });

  test("signing out everywhere invalidates every token", async () => {
    const a = await createSession(userId, null);
    const b = await createSession(userId, null);
    await invalidateUserSessions(userId);
    expect(await validateSessionToken(a.token)).toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
  });
});

describe("login rate limiting", () => {
  test("blocks an IP after repeated failures and backs off", () => {
    const ip = "203.0.113.7";
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) recordLoginFailure(ip, now);
    expect(loginRetryAfter(ip, now)).toBe(0);
    recordLoginFailure(ip, now);
    expect(loginRetryAfter(ip, now)).toBe(60);
    recordLoginFailure(ip, now);
    expect(loginRetryAfter(ip, now)).toBe(120);
    expect(loginRetryAfter("198.51.100.1", now)).toBe(0);
    recordLoginSuccess(ip);
    expect(loginRetryAfter(ip, now)).toBe(0);
  });
});
