"use server";

import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
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
import { hashPassword } from "@/lib/auth/password";
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/rate-limit";
import { createSession, invalidateSession, invalidateUserSessions } from "@/lib/auth/session";
import { type ActionState, formToObject, fromZodError, safeNext } from "@/lib/action-state";
import { deleteSetting, getSetting } from "@/lib/settings";
import { changePassword, passwordSchema, verifyLogin } from "@/server/services/auth";

async function hasUser() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(users);
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
    const [{ count }] = await tx.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(users);
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

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await hasUser())) redirect("/setup");

  const input = formToObject(formData);
  const result = await verifyLogin(input, await clientIp());
  if (!result.ok || !result.userId) return result;

  await startSession(result.userId);
  redirect(safeNext(input.next));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await invalidateSession(user.sessionId);
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser();
  const result = await changePassword(session.id, formToObject(formData));
  if (!result.ok) return result;
  // Every session was signed out; start a fresh one here.
  await startSession(session.id);
  return result;
}

export async function logoutEverywhereAction() {
  const user = await requireUser();
  await invalidateUserSessions(user.id);
  await clearSessionCookie();
  redirect("/login");
}
