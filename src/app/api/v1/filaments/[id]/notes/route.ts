import { idParam, readInput, respond, withApi } from "@/lib/auth/api";
import { addNote } from "@/server/services/filaments";

export const POST = withApi<{ id: string }>(async ({ req, params }) =>
  respond(await addNote(idParam(params.id), await readInput(req)), 201),
);
