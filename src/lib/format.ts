export function formatGrams(g: number | null | undefined, opts: { precise?: boolean } = {}) {
  if (g == null || Number.isNaN(g)) return "—";
  if (Math.abs(g) >= 1000 && !opts.precise) return `${(g / 1000).toFixed(2).replace(/\.?0+$/, "")} kg`;
  return `${Number.isInteger(g) ? g : g.toFixed(1)} g`;
}

export function formatMoney(amount: number | null | undefined, currency = "EUR") {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: Date | string | number | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function formatDateTime(value: Date | string | number | null | undefined) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRange(min: number | null | undefined, max: number | null | undefined, unit = "°C") {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
  return `${min ?? max}${unit}`;
}

export function formatLength(m: number | null | undefined) {
  if (m == null || Number.isNaN(m)) return "—";
  return `${Math.round(m)} m`;
}

export function relativeTime(value: Date | number) {
  const d = value instanceof Date ? value.getTime() : value;
  const diff = (d - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}
