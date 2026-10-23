import { describe, expect, test } from "bun:test";
import { costOf, estimateLengthM, pricePerGram, remainingGrams, remainingPercent, weighInUsage } from "@/lib/weights";

describe("weights", () => {
  test("remaining grams subtracts usage and rounds to 0.1 g", () => {
    expect(remainingGrams(1000, 37.5)).toBe(962.5);
    expect(remainingGrams(1000, 0.04)).toBe(1000);
    expect(remainingGrams(100, 120)).toBe(-20);
  });

  test("remaining percent is clamped to 0–100", () => {
    expect(remainingPercent(1000, 250)).toBe(25);
    expect(remainingPercent(1000, -5)).toBe(0);
    expect(remainingPercent(1000, 1200)).toBe(100);
    expect(remainingPercent(0, 10)).toBe(0);
  });

  test("length estimate matches a Prusament 1 kg PLA spool (~330 m)", () => {
    expect(estimateLengthM(1000, 1.75, 1.24)).toBeCloseTo(335.3, 0);
    expect(estimateLengthM(0)).toBe(0);
  });

  test("weigh-in with the spool on the scale subtracts the empty spool", () => {
    // 850 g left on record, scale says 940 g including a 140 g spool -> 800 g net, so 50 g used.
    expect(weighInUsage({ scaleGrams: 940, includesSpool: true, spoolWeight: 140, currentRemaining: 850 })).toBe(50);
  });

  test("weigh-in of filament only, and corrections upwards", () => {
    expect(weighInUsage({ scaleGrams: 700, includesSpool: false, spoolWeight: 140, currentRemaining: 750 })).toBe(50);
    expect(weighInUsage({ scaleGrams: 800, includesSpool: false, spoolWeight: null, currentRemaining: 750 })).toBe(-50);
  });

  test("weigh-in never goes below an empty spool", () => {
    expect(weighInUsage({ scaleGrams: 100, includesSpool: true, spoolWeight: 140, currentRemaining: 30 })).toBe(30);
  });

  test("cost per gram and per print", () => {
    expect(pricePerGram(25, 1000)).toBe(0.025);
    expect(costOf(40, 25, 1000)).toBeCloseTo(1);
    expect(costOf(40, null, 1000)).toBeNull();
    expect(pricePerGram(25, 0)).toBeNull();
  });
});
