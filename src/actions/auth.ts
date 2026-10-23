"use server";

import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  clearSessionCookie,
  clientIp,
  getCurrentUser,
  requireUser,
  setSessionCookie,
} from "@/lib/auth/dal";
import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/rate-limit";
import { createSession, invalidateSession, invalidateUserSessions } from "@/lib/auth/session";
import { type ActionState, formToObject, fromZodError, safeNext } from "@/lib/action-state";
import { deleteSetting, getSetting } from "@/lib/settings";

const passwordSchema = z
  .string({ error: "Password is required" })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(256);

async function hasUser() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return count > 0;
}

async function startSession(userId: number) {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(userId, ua?.slice(0, 300) ?? null);
  await setSessionCookie(token, expiresAt);
}

function codesMatch(a: string, b: string) {
  const norm = (s: string) => Buffer.from(s.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  const x = norm(a);
  const y = norm(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const setupSchema = z
  .object({
    setupCode: z.string({ error: "Setup code is required" }),
    username: z
      .string({ error: "Username is required" })
      .min(2, "At least 2 characters")
      .max(64)
      .regex(/^[\w.@-]+$/, "Letters, numbers and . _ - @ only"),
    password: passwordSchema,
    confirm: z.string({ error: "Please repeat the password" }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export async function setupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (await hasUser()) redirect("/login");

  const parsed = setupSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const ip = await clientIp();
  const wait = loginRetryAfter(ip);
  if (wait > 0) return { error: `Too many attempts. Try again in ${wait}s.` };

  const expected = await getSetting("setup_code");
  if (!expected || !codesMatch(parsed.data.setupCode, expected)) {
    recordLoginFailure(ip);
    return { fieldErrors: { setupCode: ["Wrong setup code. Check the server logs."] } };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await db.transaction(async (tx) => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)` }).from(users);
    if (count > 0) return null;
    const [user] = await tx
      .insert(users)
      .values({ username: parsed.data.username, passwordHash })
      .returning({ id: users.id });
    return user;
  });
  if (!created) redirect("/login");

  await deleteSetting("setup_code");
  recordLoginSuccess(ip);
  await startSession(created.id);
  redirect("/");
}

const loginSchema = z.object({
  username: z.string({ error: "Username is required" }).max(64),
  password: z.string({ error: "Password is required" }).max(256),
  next: z.string().optional(),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await hasUser())) redirect("/setup");

  const parsed = loginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const ip = await clientIp();
  const wait = loginRetryAfter(ip);
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${wait}s.` };

  const user = await db.query.users.findFirst({ where: eq(users.username, parsed.data.username) });
  // Always run a hash to keep timing similar for unknown usernames.
  const ok = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : (await hashPassword(parsed.data.password), false);

  if (!user || !ok) {
    recordLoginFailure(ip);
    return { error: "Wrong username or password." };
  }

  recordLoginSuccess(ip);
  await startSession(user.id);
  redirect(safeNext(parsed.data.next));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await invalidateSession(user.sessionId);
  await clearSessionCookie();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    current: z.string({ error: "Current password is required" }),
    password: passwordSchema,
    confirm: z.string({ error: "Please repeat the password" }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await db.query.users.findFirst({ where: eq(users.id, session.id) });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { fieldErrors: { current: ["Current password is wrong"] } };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, user.id));
  // Sign out every other device, then start a fresh session here.
  await invalidateUserSessions(user.id);
  await startSession(user.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

export async function logoutEverywhereAction() {
  const user = await requireUser();
  await invalidateUserSessions(user.id);
  await clearSessionCookie();
  redirect("/login");
}
