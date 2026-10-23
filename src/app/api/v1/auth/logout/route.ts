import { withApi } from "@/lib/auth/api";
import { invalidateSession } from "@/lib/auth/session";

export const POST = withApi(async ({ user }) => {
  await invalidateSession(user.sessionId);
  return Response.json({ ok: true });
});
