import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { printers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { intParam } from "@/lib/params";

/** A redirect with a relative Location, which the browser resolves against the address it scanned (see /s/[code]). */
const redirectTo = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

/** Short link printed on printer labels: /p/3 → /printers/3 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/p/[id]">) {
  const { id: raw } = await ctx.params;
  if (!(await getCurrentUser())) return redirectTo(`/login?${new URLSearchParams({ next: `/p/${raw}` })}`);
  const id = intParam(raw);
  const printer = id ? await db.query.printers.findFirst({ where: eq(printers.id, id), columns: { id: true } }) : undefined;
  if (!printer) return redirectTo("/printers");
  return redirectTo(`/printers/${printer.id}`);
}
