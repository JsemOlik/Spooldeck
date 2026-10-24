import { type NextRequest } from "next/server";
import { getSpoolIdByCode } from "@/db/queries/spools";
import { getCurrentUser } from "@/lib/auth/dal";
import { normalizeSpoolCode } from "@/lib/codes";

/**
 * A redirect with a relative Location, which the browser resolves against the address it scanned.
 * request.url can't be used: it holds the server's own listen address (0.0.0.0:3000 in Docker).
 */
const redirectTo = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

/** Short link printed on labels: /s/ABC123 → /spools/:id */
export async function GET(_request: NextRequest, ctx: RouteContext<"/s/[code]">) {
  const { code } = await ctx.params;
  if (!(await getCurrentUser())) return redirectTo(`/login?${new URLSearchParams({ next: `/s/${code}` })}`);
  const id = await getSpoolIdByCode(normalizeSpoolCode(code));
  if (!id) return redirectTo(`/scan?missing=${encodeURIComponent(code)}`);
  return redirectTo(`/spools/${id}`);
}
