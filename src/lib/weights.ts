/** Pure helpers for spool weight, length and cost maths. */

export function remainingGrams(initialWeight: number, usedGrams: number) {
  return Math.round((initialWeight - usedGrams) * 10) / 10;
}

export function remainingPercent(initialWeight: number, remaining: number) {
  if (initialWeight <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / initialWeight) * 100));
}

/** Estimated filament length in metres for a given mass. */
export function estimateLengthM(grams: number, diameterMm = 1.75, densityGcm3 = 1.24) {
  if (grams <= 0 || diameterMm <= 0 || densityGcm3 <= 0) return 0;
  const volumeCm3 = grams / densityGcm3;
  const radiusCm = diameterMm / 20;
  const lengthCm = volumeCm3 / (Math.PI * radiusCm * radiusCm);
  return lengthCm / 100;
}

/** Grams in a length of filament (mm), e.g. from the printer's extruder counter. */
export function gramsForLength(mm: number, diameterMm = 1.75, densityGcm3 = 1.24) {
  if (mm <= 0 || diameterMm <= 0 || densityGcm3 <= 0) return 0;
  const radiusMm = diameterMm / 2;
  return ((Math.PI * radiusMm * radiusMm * mm) / 1000) * densityGcm3;
}

/** Grams used since the last reading, given a scale reading of the whole spool. */
export function weighInUsage(opts: { scaleGrams: number; includesSpool: boolean; spoolWeight: number | null; currentRemaining: number }) {
  const net = opts.includesSpool ? opts.scaleGrams - (opts.spoolWeight ?? 0) : opts.scaleGrams;
  return Math.round((opts.currentRemaining - Math.max(0, net)) * 10) / 10;
}

export function pricePerGram(price: number | null | undefined, initialWeight: number) {
  if (price == null || initialWeight <= 0) return null;
  return price / initialWeight;
}

export function costOf(grams: number, price: number | null | undefined, initialWeight: number) {
  const ppg = pricePerGram(price, initialWeight);
  return ppg == null ? null : ppg * grams;
}
