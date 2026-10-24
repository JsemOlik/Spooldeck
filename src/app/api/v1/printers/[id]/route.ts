import { idParam, jsonToInput, notFound, readJson, respond, withApi } from "@/lib/auth/api";
import { deletePrinter, getPrinter, updatePrinter } from "@/server/services/printers";

type Params = { id: string };

export const GET = withApi<Params>(async ({ params }) => {
  const printer = await getPrinter(idParam(params.id));
  if (!printer) notFound("Printer not found");
  return Response.json(printer);
});

export const PUT = withApi<Params>(async ({ req, params }) => {
  const body = await readJson(req);
  const input = jsonToInput(body);
  // Leaving apiKey out keeps the saved key; null removes it.
  if (body && typeof body === "object" && "apiKey" in body && body.apiKey === null) input.clearApiKey = "on";
  return respond(await updatePrinter(idParam(params.id), input));
});

export const DELETE = withApi<Params>(async ({ params }) => respond(await deletePrinter(idParam(params.id))));
