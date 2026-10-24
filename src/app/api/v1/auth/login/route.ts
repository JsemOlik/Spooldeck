import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { errorResponse, readInput, requestIp, respond } from "@/lib/auth/api";
import { createSession } from "@/lib/auth/session";
import { verifyLogin } from "@/server/services/auth";

/** Exchanges a username and password for a bearer token (a regular 30-day sliding session). */
export async function POST(req: Request) {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(users);
    if (count === 0) return Response.json({ error: "Finish setup in the browser first." }, { status: 409 });

    const input = await readInput(req);
    const result = await verifyLogin(input, requestIp(req));
    if (!result.ok || !result.userId) {
      return result.fieldErrors ? respond(result) : Response.json({ error: result.error }, { status: 401 });
    }

    const ua = req.headers.get("user-agent");
    const { token, expiresAt } = await createSession(result.userId, (ua ?? "Spooldeck API").slice(0, 300));
    const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, result.userId!), columns: { id: true, username: true } });
    return Response.json({ token, expiresAt, user });
  } catch (e) {
    return errorResponse(e);
  }
}
