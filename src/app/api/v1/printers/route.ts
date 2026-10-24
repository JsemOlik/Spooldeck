import { readInput, respond, withApi } from "@/lib/auth/api";
import { createPrinter, listPrinters } from "@/server/services/printers";

export const GET = withApi(async () => Response.json(await listPrinters()));

export const POST = withApi(async ({ req }) => respond(await createPrinter(await readInput(req)), 201));
