import { getFilamentDetail } from "@/db/queries/filaments";
import { idParam, notFound, readInput, respond, withApi } from "@/lib/auth/api";
import { deleteFilament, updateFilament } from "@/server/services/filaments";

type Params = { id: string };

export const GET = withApi<Params>(async ({ params }) => {
  const filament = await getFilamentDetail(idParam(params.id));
  if (!filament) notFound("Filament not found");
  return Response.json(filament);
});

export const PUT = withApi<Params>(async ({ req, params }) =>
  respond(await updateFilament(idParam(params.id), await readInput(req))),
);

export const DELETE = withApi<Params>(async ({ params }) => respond(await deleteFilament(idParam(params.id))));
