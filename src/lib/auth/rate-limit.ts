type Bucket = { failures: number; windowStart: number; blockedUntil: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_GLOBAL = 30;

const store = globalThis as unknown as { __spooldeckRateLimit?: Map<string, Bucket> };
const buckets = (store.__spooldeckRateLimit ??= new Map());

const GLOBAL_KEY = "__global__";

function bucket(key: string, now: number) {
  let b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { failures: 0, windowStart: now, blockedUntil: b?.blockedUntil ?? 0 };
    buckets.set(key, b);
  }
  return b;
}

/** Returns the number of seconds the caller must wait, or 0 if allowed. */
export function loginRetryAfter(ip: string, now = Date.now()): number {
  const wait = Math.max(bucket(ip, now).blockedUntil, bucket(GLOBAL_KEY, now).blockedUntil) - now;
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  const b = bucket(ip, now);
  b.failures++;
  if (b.failures >= MAX_FAILURES_PER_IP) {
    // Exponential backoff: 1, 2, 4, 8 ... minutes, capped at 1 hour.
    const exponent = b.failures - MAX_FAILURES_PER_IP;
    b.blockedUntil = now + Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** exponent);
  }
  const g = bucket(GLOBAL_KEY, now);
  g.failures++;
  if (g.failures >= MAX_FAILURES_GLOBAL) g.blockedUntil = now + 5 * 60 * 1000;
}

export function recordLoginSuccess(ip: string) {
  buckets.delete(ip);
}
