import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "spooldeck_session";
const SESSION_TTL_S = 30 * 24 * 60 * 60;
const PUBLIC_PATHS = ["/login", "/setup", "/api/health"];

/**
 * Optimistic check only: redirects visitors without a session cookie to /login.
 * The real session validation happens in requireUser() (src/lib/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (token && !isPublic) {
    // Sliding expiry for the cookie; the DB session is renewed in validateSessionToken().
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: proto === "https",
      path: "/",
      maxAge: SESSION_TTL_S,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest).*)"],
};
