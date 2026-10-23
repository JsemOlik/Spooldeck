import { ApiError, withApi } from "@/lib/auth/api";
import { previewPrusament } from "@/server/services/scan";

export const GET = withApi(async ({ req }) => {
  const preview = await previewPrusament(new URL(req.url).searchParams.get("url") ?? "");
  if ("error" in preview) throw new ApiError(422, preview.error!);
  return Response.json(preview);
});
