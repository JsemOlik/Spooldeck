import { idParam, readInput, respond, withApi } from "@/lib/auth/api";
import { weighIn } from "@/server/services/spools";

/** Body: { scaleGrams, includesSpool: boolean, note? } */
export const POST = withApi<{ id: string }>(async ({ req, params }) => {
  const input = await readInput(req);
  const includesSpool = input.includesSpool === "true" || input.includesSpool === "on" ? "on" : "off";
  return respond(await weighIn(idParam(params.id), { ...input, includesSpool }));
});
