import { readInput, respond, withApi } from "@/lib/auth/api";
import { importPrusament } from "@/server/services/scan";

export const POST = withApi(async ({ req }) => respond(await importPrusament(await readInput(req)), 201));
