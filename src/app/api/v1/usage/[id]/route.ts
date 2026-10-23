import { idParam, notFound, withApi } from "@/lib/auth/api";
import { deleteUsage } from "@/server/services/spools";

export const DELETE = withApi<{ id: string }>(async ({ params }) => {
  if (!(await deleteUsage(idParam(params.id)))) notFound("Usage entry not found");
  return Response.json({ ok: true });
});
