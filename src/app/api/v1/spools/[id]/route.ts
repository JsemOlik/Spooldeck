import { db } from "@/db";
import { getSpoolDetail } from "@/db/queries/spools";
import { baseUrlFor, idParam, notFound, readInput, respond, withApi } from "@/lib/auth/api";
import { spoolUrl } from "@/lib/qr";
import { deleteSpool, updateSpool } from "@/server/services/spools";

type Params = { id: string };

export const GET = withApi<Params>(async ({ req, params }) => {
  const spool = await getSpoolDetail(idParam(params.id));
  if (!spool) notFound("Spool not found");
  const filamentNotes = await db.query.filamentNotes.findMany({
    where: (n, { eq }) => eq(n.filamentId, spool.filamentId),
    orderBy: (n, { desc }) => [desc(n.createdAt)],
    limit: 5,
    with: { spool: { columns: { id: true, code: true } } },
  });
  return Response.json({ ...spool, filamentNotes, qrUrl: spoolUrl(await baseUrlFor(req), spool.code) });
});

export const PUT = withApi<Params>(async ({ req, params }) => respond(await updateSpool(idParam(params.id), await readInput(req))));

export const DELETE = withApi<Params>(async ({ params }) => {
  const id = idParam(params.id);
  const exists = await db.query.spools.findFirst({ where: (s, { eq }) => eq(s.id, id), columns: { id: true } });
  if (!exists) notFound("Spool not found");
  await deleteSpool(id);
  return Response.json({ ok: true });
});
