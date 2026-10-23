import { SPOOL_STATUSES } from "@/db/schema";
import { listSpools } from "@/db/queries/spools";
import { readInput, respond, withApi } from "@/lib/auth/api";
import { intParam, oneOf, strParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";
import { createSpools } from "@/server/services/spools";

export const GET = withApi(async ({ req }) => {
  const p = new URL(req.url).searchParams;
  const get = (k: string) => p.get(k) ?? undefined;
  const low = get("low") === "1" ? (await getAppSettings()).lowStockGrams : undefined;
  const spools = await listSpools({
    q: strParam(get("q")),
    materialId: intParam(get("materialId")),
    brandId: intParam(get("brandId")),
    filamentId: intParam(get("filamentId")),
    status: oneOf(get("status"), ["active", "all", ...SPOOL_STATUSES] as const),
    location: strParam(get("location")),
    sort: oneOf(get("sort"), ["name", "remaining", "recent", "used"] as const),
    lowStockGrams: low,
  });
  return Response.json({ spools });
});

export const POST = withApi(async ({ req }) => respond(await createSpools(await readInput(req)), 201));
