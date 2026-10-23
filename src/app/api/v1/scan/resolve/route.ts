import { readInput, withApi } from "@/lib/auth/api";
import { resolveScan } from "@/server/services/scan";

/** Body: { text } — returns { kind: "spool", id } | { kind: "prusament", url } | { kind: "error", error } */
export const POST = withApi(async ({ req }) => Response.json(await resolveScan((await readInput(req)).text ?? "")));
