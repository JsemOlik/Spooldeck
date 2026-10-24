import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { getAppSettings } from "@/lib/settings";
import { validateSessionToken, type SessionUser } from "./session";

/**
 * Helpers for the bearer-token JSON API under /api/v1.
 * Tokens are ordinary session tokens, so signing out everywhere revokes them too.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: ActionState["fieldErrors"],
  ) {
    super(message);
  }
}

export function bearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  return m?.[1] ?? null;
}

export async function getApiUser(req: Request): Promise<SessionUser | null> {
  const token = bearerToken(req);
  return token ? validateSessionToken(token) : null;
}

/** Base URL for label QR codes, like getBaseUrl() but from the request instead of next/headers. */
export async function baseUrlFor(req: Request) {
  const { publicUrl } = await getAppSettings();
  if (publicUrl) return publicUrl.replace(/\/+$/, "");
  return detectedBaseUrl(req);
}

export function detectedBaseUrl(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function requestIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Turns a JSON body into the string record the Zod schemas expect (mirrors formToObject):
 * null/"" become undefined, numbers and booleans become strings.
 */
export function jsonToInput(body: unknown): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed !== "") out[key] = trimmed;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
    }
  }
  return out;
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Body must be valid JSON");
  }
}

export async function readInput(req: Request) {
  return jsonToInput(await readJson(req));
}

/** Maps a service result to a response: 200 with the result, 400 for validation, 404 for missing rows. */
export function respond<T extends ActionState>(result: T, okStatus = 200) {
  if (result.ok) return Response.json(result, { status: okStatus });
  const status = result.fieldErrors ? 400 : /not found/i.test(result.error ?? "") ? 404 : 409;
  return Response.json({ error: result.error ?? "Please fix the highlighted fields.", fieldErrors: result.fieldErrors }, { status });
}

export function idParam(value: string | undefined) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, "Not found");
  return id;
}

export function notFound(what = "Not found"): never {
  throw new ApiError(404, what);
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (args: { req: Request; user: SessionUser; params: P }) => Promise<Response>;

/**
 * Wraps a route handler: authenticates the bearer token, turns ApiErrors into JSON, and
 * revalidates the web UI after successful mutations so open browser tabs stay fresh.
 */
export function withApi<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      const user = await getApiUser(req);
      if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
      const res = await handler({ req, user, params: await ctx.params });
      if (req.method !== "GET" && res.ok) revalidate();
      return res;
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return Response.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.status });
  console.error("[api]", e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

function revalidate() {
  try {
    revalidatePath("/", "layout");
  } catch {
    // Outside a Next.js request (e.g. tests) there is no cache to revalidate.
  }
}
