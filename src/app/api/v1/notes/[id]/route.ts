import { idParam, withApi } from "@/lib/auth/api";
import { deleteNote } from "@/server/services/filaments";

export const DELETE = withApi<{ id: string }>(async ({ params }) => {
  await deleteNote(idParam(params.id));
  return Response.json({ ok: true });
});
