import { z } from "zod";

export type PrusamentRef = { goodsId: number | null; spoolId: string };

const SPOOL_PATH_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?spool\/(?:(\d+)\/)?([0-9a-f]{6,32})\/?$/i;

/** Parses a Prusament spool URL. Only prusament.com hosts are accepted. */
export function parsePrusamentUrl(input: string): PrusamentRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "prusament.com" && host !== "www.prusament.com") return null;
  const m = SPOOL_PATH_RE.exec(url.pathname);
  if (!m) return null;
  return { goodsId: m[1] ? Number(m[1]) : null, spoolId: m[2].toLowerCase() };
}

export function prusamentSpoolUrl(ref: PrusamentRef) {
  return ref.goodsId
    ? `https://prusament.com/spool/${ref.goodsId}/${ref.spoolId}/`
    : `https://prusament.com/spool/${ref.spoolId}/`;
}

const numish = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

export const prusamentDataSchema = z.object({
  ff_goods_id: numish.nullish(),
  country: z.string().nullish(),
  sample: z.boolean().nullish(),
  diameter_standard_deviation: numish.nullish(),
  filament: z.object({
    color_name: z.string().nullish(),
    color_rgb: z.string().nullish(),
    material: z.string().nullish(),
    name: z.string(),
    photo_url: z.string().nullish(),
    he_min: numish.nullish(),
    he_max: numish.nullish(),
    hb_min: numish.nullish(),
    hb_max: numish.nullish(),
  }),
  length: numish.nullish(),
  manufacture_date: z.string().nullish(),
  max_diameter_offset: numish.nullish(),
  ovality: numish.nullish(),
  weight: numish,
  spool_weight: numish.nullish(),
});

export type PrusamentData = z.infer<typeof prusamentDataSchema>;

/** Extracts the `var spoolData = '{...}'` JSON embedded in a Prusament spool page. */
export function extractSpoolData(html: string): PrusamentData | null {
  if (/var\s+spoolFound\s*=\s*false/.test(html)) return null;
  const m = /var\s+spoolData\s*=\s*'((?:[^'\\]|\\.)*)'/.exec(html);
  if (!m) return null;
  const raw = m[1].replace(/\\'/g, "'");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = prusamentDataSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type PrusamentPrice = { amount: number; currency: string };

function parseAmount(raw: string) {
  let s = raw.replace(/[\s\u00a0]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reads the list prices shown on a spool page, e.g. `<div class="price">32.99 USD / 32.99 EUR</div>`. */
export function extractPrices(html: string): PrusamentPrice[] {
  const block = /<div[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!block) return [];
  const text = block[1].replace(/<small[\s\S]*?<\/small>/gi, "").replace(/<[^>]+>/g, " ");
  const prices: PrusamentPrice[] = [];
  for (const m of text.matchAll(/(\d[\d\s\u00a0.,]*?)\s*([A-Z]{3})\b/g)) {
    const amount = parseAmount(m[1]);
    if (amount != null && !prices.some((p) => p.currency === m[2])) prices.push({ amount, currency: m[2] });
  }
  return prices;
}

/** Picks the list price in the preferred currency, falling back to the first one shown. */
export function pickPrice(prices: PrusamentPrice[], currency: string) {
  return prices.find((p) => p.currency === currency.toUpperCase()) ?? prices[0] ?? null;
}

export class PrusamentError extends Error {}

export type PrusamentPage = { data: PrusamentData; prices: PrusamentPrice[] };

export async function fetchPrusamentSpool(ref: PrusamentRef, fetchImpl: typeof fetch = fetch): Promise<PrusamentPage> {
  const url = prusamentSpoolUrl(ref);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { "User-Agent": "Spooldeck (self-hosted filament tracker)", Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    throw new PrusamentError(`Couldn't reach prusament.com (${e instanceof Error ? e.message : "network error"})`);
  }
  if (!res.ok) throw new PrusamentError(`prusament.com answered ${res.status}`);
  const finalHost = new URL(res.url || url).hostname;
  if (!/(^|\.)prusament\.com$/.test(finalHost)) throw new PrusamentError("Unexpected redirect away from prusament.com");
  const html = await res.text();
  const data = extractSpoolData(html);
  if (!data) throw new PrusamentError("Spool not found on prusament.com");
  return { data, prices: extractPrices(html) };
}

function nominalWeightFromName(name: string, fallback: number) {
  const kg = /(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(name);
  if (kg) return Math.round(Number(kg[1].replace(",", ".")) * 1000);
  const g = /(\d{3,4})\s*g\b/i.exec(name);
  if (g) return Number(g[1]);
  return fallback;
}

function hex(v: string | null | undefined) {
  if (!v) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** Maps Prusament data to Spooldeck filament + spool fields. */
export function mapPrusamentData(data: PrusamentData, ref: PrusamentRef) {
  const f = data.filament;
  const weight = Math.round(data.weight);
  return {
    filament: {
      brand: "Prusament",
      material: f.material?.trim() || null,
      name: f.name.trim(),
      colorName: f.color_name?.trim() || null,
      colorHex: hex(f.color_rgb),
      diameter: 1.75,
      nominalWeight: nominalWeightFromName(f.name, weight),
      spoolWeight: data.spool_weight != null ? Math.round(data.spool_weight) : null,
      nozzleMin: f.he_min ?? null,
      nozzleMax: f.he_max ?? null,
      bedMin: f.hb_min ?? null,
      bedMax: f.hb_max ?? null,
      imageUrl: f.photo_url && /^https:\/\//.test(f.photo_url) ? f.photo_url : null,
      prusamentGoodsId: data.ff_goods_id ?? ref.goodsId,
    },
    spool: {
      prusamentSpoolId: ref.spoolId,
      initialWeight: weight,
      spoolWeight: data.spool_weight != null ? Math.round(data.spool_weight) : null,
      lengthM: data.length ?? null,
      manufactureDate: data.manufacture_date ?? null,
      diameterTolerance: data.max_diameter_offset ?? null,
      diameterSd: data.diameter_standard_deviation ?? null,
      ovality: data.ovality != null ? Math.round(data.ovality * 100) / 100 : null,
    },
  };
}

export type MappedPrusament = ReturnType<typeof mapPrusamentData>;
