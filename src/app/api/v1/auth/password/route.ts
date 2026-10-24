import { readInput, respond, withApi } from "@/lib/auth/api";
import { createSession } from "@/lib/auth/session";
import { changePassword } from "@/server/services/auth";

/** Changes the password. Every session is signed out, so a fresh token is returned. */
export const POST = withApi(async ({ req, user }) => {
  const result = await changePassword(user.id, await readInput(req));
  if (!result.ok) return respond(result);
  const ua = req.headers.get("user-agent");
  const { token, expiresAt } = await createSession(user.id, (ua ?? "Spooldeck API").slice(0, 300));
  return Response.json({ ...result, token, expiresAt });
});
