import { getSpoolIdByCode } from "@/db/queries/spools";
import { notFound, withApi } from "@/lib/auth/api";
import { normalizeSpoolCode } from "@/lib/codes";

export const GET = withApi<{ code: string }>(async ({ params }) => {
  const id = await getSpoolIdByCode(normalizeSpoolCode(params.code));
  if (!id) notFound(`No spool with code ${params.code}`);
  return Response.json({ id });
});
