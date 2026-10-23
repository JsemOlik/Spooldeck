import { idParam, notFound, readInput, respond, withApi } from "@/lib/auth/api";
import { oneOf } from "@/lib/params";
import { CATALOG_KINDS, deleteCatalogItem, saveCatalogItem } from "@/server/services/settings";

type Params = { kind: string; id: string };

export const PUT = withApi<Params>(async ({ req, params }) => {
  const kind = oneOf(params.kind, CATALOG_KINDS) ?? notFound();
  return respond(await saveCatalogItem(kind, idParam(params.id), await readInput(req)));
});

export const DELETE = withApi<Params>(async ({ params }) => {
  const kind = oneOf(params.kind, CATALOG_KINDS) ?? notFound();
  await deleteCatalogItem(kind, idParam(params.id));
  return Response.json({ ok: true });
});
