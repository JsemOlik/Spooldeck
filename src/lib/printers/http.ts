import { createHash, randomBytes } from "node:crypto";

/** The parts of a printer that its HTTP client needs. */
export type Connection = { url: string; username: string | null; apiKey: string | null };

/** A printer problem with a message that can be shown as is. */
export class PrinterError extends Error {}

/**
 * Turns what people paste into a base URL: adds http:// when the scheme is missing and drops
 * anything after the path, so "voron.local:7125" and "http://voron.local/#/" both work.
 */
export function normalizePrinterUrl(input: string) {
  const value = input.trim();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

const TIMEOUT_MS = 5000;

// Digest challenges per printer, reused with a growing nonce count so each request needs one round trip.
type Challenge = { realm: string; nonce: string; qop: string | null; opaque: string | null; nc: number };
const g = globalThis as unknown as { __spooldeckDigest?: Map<string, Challenge> };
const challenges = (g.__spooldeckDigest ??= new Map());

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function parseChallenge(header: string | null): Challenge | null {
  if (!header || !/^digest\s/i.test(header)) return null;
  const params = Object.fromEntries([...header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]));
  if (!params.nonce) return null;
  const qop = params.qop?.split(",").map((q) => q.trim()).includes("auth") ? "auth" : null;
  return { realm: params.realm ?? "", nonce: params.nonce, qop, opaque: params.opaque ?? null, nc: 0 };
}

function digestHeader(c: Challenge, username: string, password: string, method: string, uri: string) {
  c.nc += 1;
  const nc = c.nc.toString(16).padStart(8, "0");
  const cnonce = randomBytes(8).toString("hex");
  const ha1 = md5(`${username}:${c.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = c.qop ? md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop}:${ha2}`) : md5(`${ha1}:${c.nonce}:${ha2}`);
  const parts = [`username="${username}"`, `realm="${c.realm}"`, `nonce="${c.nonce}"`, `uri="${uri}"`, `response="${response}"`, "algorithm=MD5"];
  if (c.qop) parts.push(`qop=${c.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (c.opaque) parts.push(`opaque="${c.opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

/**
 * GETs a path from the printer. The key goes in X-Api-Key (Moonraker, and PrusaLink's password);
 * when a username is set and the printer asks for Digest sign-in, that is answered too.
 */
export async function printerGet(conn: Connection, path: string, opts: { timeoutMs?: number } = {}): Promise<Response> {
  const url = `${conn.url}${path}`;
  const uri = new URL(url).pathname + new URL(url).search;
  const cacheKey = `${conn.url}|${conn.username}`;
  const send = async (challenge?: Challenge) => {
    const headers: Record<string, string> = {};
    if (conn.apiKey && !conn.username) headers["X-Api-Key"] = conn.apiKey;
    if (challenge && conn.username) headers.Authorization = digestHeader(challenge, conn.username, conn.apiKey ?? "", "GET", uri);
    try {
      return await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS), cache: "no-store" });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      throw new PrinterError(timedOut ? "The printer didn't answer in time" : "Can't reach the printer");
    }
  };

  let res = await send(challenges.get(cacheKey));
  if (res.status === 401 && conn.username) {
    const challenge = parseChallenge(res.headers.get("www-authenticate"));
    if (challenge) {
      await res.body?.cancel();
      challenges.set(cacheKey, challenge);
      res = await send(challenge);
    }
  }
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel();
    challenges.delete(cacheKey);
    throw new PrinterError(conn.apiKey ? "The printer rejected the password or API key" : "The printer needs a password or API key");
  }
  return res;
}

/** GETs JSON, turning error responses into a PrinterError. Returns null for 204 No Content. */
export async function printerJson(conn: Connection, path: string, what: string): Promise<unknown> {
  const res = await printerGet(conn, path);
  if (res.status === 204) return null;
  const body = (await res.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
  if (!res.ok || body === undefined) {
    const message = body?.error?.message;
    if (res.status === 404 && !message) throw new PrinterError(`This address isn't ${what}`);
    throw new PrinterError(message ? `${what}: ${message}` : `${what} answered with HTTP ${res.status}`);
  }
  return body;
}
