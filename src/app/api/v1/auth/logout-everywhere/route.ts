import { withApi } from "@/lib/auth/api";
import { invalidateUserSessions } from "@/lib/auth/session";

export const POST = withApi(async ({ user }) => {
  await invalidateUserSessions(user.id);
  return Response.json({ ok: true });
});
