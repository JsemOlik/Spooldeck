import { NextResponse, type NextRequest } from "next/server";
import { getSpoolIdByCode } from "@/db/queries/spools";
import { getCurrentUser } from "@/lib/auth/dal";
import { normalizeSpoolCode } from "@/lib/codes";

/** Short link printed on labels: /s/ABC123 → /spools/:id */
export async function GET(request: NextRequest, ctx: RouteContext<"/s/[code]">) {
  const { code } = await ctx.params;
  if (!(await getCurrentUser())) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/s/${code}`);
    return NextResponse.redirect(login);
  }
  const id = await getSpoolIdByCode(normalizeSpoolCode(code));
  if (!id) return NextResponse.redirect(new URL(`/scan?missing=${encodeURIComponent(code)}`, request.url));
  return NextResponse.redirect(new URL(`/spools/${id}`, request.url));
}
