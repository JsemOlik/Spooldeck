export function intParam(v: string | string[] | undefined) {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function strParam(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export function oneOf<T extends string>(v: string | string[] | undefined, values: readonly T[]): T | undefined {
  const s = strParam(v);
  return s && (values as readonly string[]).includes(s) ? (s as T) : undefined;
}
