import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { PASSWORD_MIN_LENGTH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from "@/lib/auth/rate-limit";
import { invalidateUserSessions } from "@/lib/auth/session";
import type { Input } from "./spools";

export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(256);

export const loginSchema = z.object({
  username: z.string({ error: "Username is required" }).max(64),
  password: z.string({ error: "Password is required" }).max(256),
  next: z.string().optional(),
});

/** Checks credentials with rate limiting. Returns the user id, or an error state. */
export async function verifyLogin(input: Input, ip: string): Promise<ActionState & { userId?: number }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

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
  return { ok: true, userId: user.id };
}

const changePasswordSchema = z
  .object({
    current: z.string({ error: "Current password is required" }),
    password: passwordSchema,
    confirm: z.string({ error: "Please repeat the password" }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Changes the password and signs out every session; the caller starts a fresh one. */
export async function changePassword(userId: number, input: Input): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { fieldErrors: { current: ["Current password is wrong"] } };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, user.id));
  await invalidateUserSessions(user.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}
