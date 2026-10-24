import { readJson, respond, withApi } from "@/lib/auth/api";
import { logPrint } from "@/server/services/spools";

/** Body: { printName?, note?, usage: [{ spoolId, grams }] } */
export const POST = withApi(async ({ req }) => respond(await logPrint(await readJson(req)), 201));
