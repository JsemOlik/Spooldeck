import { ApiError, idParam, readInput, respond, withApi } from "@/lib/auth/api";
import { loadSpool } from "@/server/services/printers";

export const POST = withApi<{ id: string }>(async ({ req, params }) => {
  const { spoolId } = await readInput(req);
  const id = spoolId === undefined ? null : Number(spoolId);
  if (id !== null && !(Number.isInteger(id) && id > 0)) {
    throw new ApiError(400, "Unknown spool", { spoolId: ["Use a spool id, or null to unload"] });
  }
  return respond(await loadSpool(idParam(params.id), id));
});
