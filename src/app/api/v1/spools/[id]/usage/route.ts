import { idParam, readInput, respond, withApi } from "@/lib/auth/api";
import { logUsage } from "@/server/services/spools";

export const POST = withApi<{ id: string }>(async ({ req, params }) =>
  respond(await logUsage(idParam(params.id), await readInput(req)), 201),
);
