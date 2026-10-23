import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { withApi } from "@/lib/auth/api";

export const GET = withApi(async ({ user }) => {
  const [{ sessionCount }] = await db
    .select({ sessionCount: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())));
  return Response.json({ id: user.id, username: user.username, sessionCount });
});
