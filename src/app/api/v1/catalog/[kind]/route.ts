import { listBrandsWithCounts, listMaterialsWithCounts, listVendorsWithCounts } from "@/db/queries/catalog";
import { notFound, readInput, respond, withApi } from "@/lib/auth/api";
import { oneOf } from "@/lib/params";
import { CATALOG_KINDS, saveCatalogItem } from "@/server/services/settings";

type Params = { kind: string };

const LISTS = { brands: listBrandsWithCounts, vendors: listVendorsWithCounts, materials: listMaterialsWithCounts };

export const GET = withApi<Params>(async ({ params }) => {
  const kind = oneOf(params.kind, CATALOG_KINDS) ?? notFound();
  return Response.json({ items: await LISTS[kind]() });
});

export const POST = withApi<Params>(async ({ req, params }) => {
  const kind = oneOf(params.kind, CATALOG_KINDS) ?? notFound();
  return respond(await saveCatalogItem(kind, null, await readInput(req)), 201);
});
