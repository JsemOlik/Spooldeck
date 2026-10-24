import type { SlicedFilament } from "./parse";

export type SpoolCandidate = {
  id: number;
  status: string;
  remaining: number;
  filamentName: string;
  colorName: string | null;
  colorHex: string | null;
  brandName: string | null;
  materialName: string | null;
  density: number | null;
};

/** Used when neither the slicer nor the spool's material knows the density (PLA's is ~1.24). */
export const DEFAULT_DENSITY = 1.24;

/** Grams for a sliced filament, estimated from its volume and the spool's density when the slicer had none. */
export function gramsFor(filament: SlicedFilament, spool?: Pick<SpoolCandidate, "density"> | null) {
  if (filament.grams != null) return filament.grams;
  if (filament.cm3 == null) return null;
  return Math.round(filament.cm3 * (spool?.density ?? DEFAULT_DENSITY) * 100) / 100;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
const compact = (s: string | null | undefined) => norm(s).replace(/ /g, "");

function colorDistance(a: string, b: string) {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** How well a spool fits a sliced filament. Material and profile name weigh most; colour breaks ties. */
export function scoreSpool(filament: SlicedFilament, spool: SpoolCandidate) {
  let score = 0;
  const type = compact(filament.type);
  const material = compact(spool.materialName);
  if (type && material) {
    if (type === material) score += 4;
    else if (type.startsWith(material) || material.startsWith(type)) score += 1;
    else score -= 2;
  }

  const profile = ` ${norm(filament.profile)} `;
  const contains = (s: string | null) => {
    const n = norm(s);
    return n.length >= 3 && profile.includes(` ${n} `);
  };
  if (contains(spool.filamentName)) score += 4;
  if (contains(spool.colorName)) score += 2;
  if (contains(spool.brandName)) score += 1;

  if (filament.colorHex && spool.colorHex) score += 2 * Math.max(0, 1 - colorDistance(filament.colorHex, spool.colorHex) / 150);

  const grams = gramsFor(filament, spool);
  if (grams != null && spool.remaining < grams) score -= 2;
  // Finish opened spools before starting new ones.
  if (spool.status === "opened") score += 0.5;
  return score;
}

const MIN_SCORE = 3;

/**
 * Picks a spool for each sliced filament, or null when nothing fits well enough.
 * Assigns the best pairs first so two extruders don't land on the same spool.
 */
export function suggestSpools(filaments: SlicedFilament[], spools: SpoolCandidate[]): (number | null)[] {
  const pairs = filaments.flatMap((f, fi) =>
    spools.map((s) => ({ fi, spoolId: s.id, score: scoreSpool(f, s), remaining: s.remaining })),
  );
  pairs.sort((a, b) => b.score - a.score || a.remaining - b.remaining);

  const result: (number | null)[] = filaments.map(() => null);
  const taken = new Set<number>();
  for (const p of pairs) {
    if (p.score < MIN_SCORE || result[p.fi] != null || taken.has(p.spoolId)) continue;
    result[p.fi] = p.spoolId;
    taken.add(p.spoolId);
  }
  return result;
}
