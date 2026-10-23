import { SPOOL_STATUSES } from "@/db/schema";
import { ApiError, idParam, readInput, withApi } from "@/lib/auth/api";
import { oneOf } from "@/lib/params";
import { setSpoolStatus } from "@/server/services/spools";

export const POST = withApi<{ id: string }>(async ({ req, params }) => {
  const status = oneOf((await readInput(req)).status, SPOOL_STATUSES);
  if (!status) throw new ApiError(400, "Unknown status", { status: [`Use one of ${SPOOL_STATUSES.join(", ")}`] });
  await setSpoolStatus(idParam(params.id), status);
  return Response.json({ ok: true });
});
