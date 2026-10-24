/** A positive id that fits Postgres's integer columns, so a made-up one can't make a query fail. */
export function intParam(v: string | string[] | undefined) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : undefined;
}

export function strParam(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export function oneOf<T extends string>(v: string | string[] | undefined, values: readonly T[]): T | undefined {
  const s = strParam(v);
  return s && (values as readonly string[]).includes(s) ? (s as T) : undefined;
}

/** Parses a comma-separated list of positive integer ids, keeping order and dropping duplicates. */
export function idListParam(v: string | string[] | undefined, max = 500) {
  const ids = (strParam(v) ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, max);
}
