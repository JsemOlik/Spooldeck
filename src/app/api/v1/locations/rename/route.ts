import { ApiError, readInput, respond, withApi } from "@/lib/auth/api";
import { renameLocation } from "@/server/services/settings";

/** Body: { from, name } — an empty name clears the location on those spools. */
export const POST = withApi(async ({ req }) => {
  const input = await readInput(req);
  if (!input.from) throw new ApiError(400, "Which location?", { from: ["Required"] });
  return respond(await renameLocation(input.from, input));
});
