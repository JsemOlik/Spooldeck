import { idParam, readInput, withApi } from "@/lib/auth/api";
import { setFilamentArchived } from "@/server/services/filaments";

/** Body: { archived: boolean } */
export const POST = withApi<{ id: string }>(async ({ req, params }) => {
  const { archived } = await readInput(req);
  await setFilamentArchived(idParam(params.id), archived !== "false");
  return Response.json({ ok: true });
});
