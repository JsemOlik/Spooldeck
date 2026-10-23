import { listFilaments } from "@/db/queries/filaments";
import { readInput, respond, withApi } from "@/lib/auth/api";
import { intParam, strParam } from "@/lib/params";
import { createFilament } from "@/server/services/filaments";

export const GET = withApi(async ({ req }) => {
  const p = new URL(req.url).searchParams;
  const get = (k: string) => p.get(k) ?? undefined;
  const filaments = await listFilaments({
    q: strParam(get("q")),
    materialId: intParam(get("materialId")),
    brandId: intParam(get("brandId")),
    archived: get("archived") === "1",
  });
  return Response.json({ filaments });
});

export const POST = withApi(async ({ req }) => respond(await createFilament(await readInput(req)), 201));
