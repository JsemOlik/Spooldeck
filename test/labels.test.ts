import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, decodeConfig, encodeConfig, LABEL_PRESETS, PAGE_SIZES_MM, sheetGeometry, type SheetLayout } from "@/lib/labels/config";

describe("label config", () => {
  test("round-trips through the print URL encoding", () => {
    const config = { ...DEFAULT_CONFIG, widthMm: 62, heightMm: 29, layout: { ...DEFAULT_CONFIG.layout, fields: ["brand", "code"] as const } };
    expect(decodeConfig(encodeConfig({ ...config, layout: { ...config.layout, fields: [...config.layout.fields] } }))).toEqual({
      ...config,
      layout: { ...config.layout, fields: ["brand", "code"] },
    });
  });

  test("rejects tampered or out-of-range configs", () => {
    expect(decodeConfig("not-base64!")).toBeNull();
    expect(decodeConfig(Buffer.from(JSON.stringify({ ...DEFAULT_CONFIG, widthMm: 5000 })).toString("base64url"))).toBeNull();
    expect(decodeConfig(null)).toBeNull();
  });

  test("fills in layout defaults for partial configs", () => {
    const decoded = decodeConfig(Buffer.from(JSON.stringify({ widthMm: 40, heightMm: 30, layout: {} })).toString("base64url"));
    expect(decoded?.layout).toEqual(DEFAULT_CONFIG.layout);
    expect(decoded?.sheet).toBeNull();
  });

  test("sticker sheet presets fit on their page", () => {
    for (const p of LABEL_PRESETS.filter((x) => x.sheet)) {
      const s = p.sheet!;
      const [pw, ph] = PAGE_SIZES_MM[s.page];
      expect(s.marginLeftMm + s.cols * p.widthMm + (s.cols - 1) * s.gapXMm).toBeLessThanOrEqual(pw + 0.01);
      expect(s.marginTopMm + s.rows * p.heightMm + (s.rows - 1) * s.gapYMm).toBeLessThanOrEqual(ph + 0.01);
    }
  });

  test("old sheets without page padding still decode", () => {
    const sheet: Partial<SheetLayout> = { ...LABEL_PRESETS.find((p) => p.id === "a4-3x8")!.sheet! };
    delete sheet.pagePaddingMm;
    const decoded = decodeConfig(Buffer.from(JSON.stringify({ widthMm: 70, heightMm: 37, layout: {}, sheet })).toString("base64url"));
    expect(decoded?.sheet?.pagePaddingMm).toBe(0);
  });
});

describe("sheet geometry", () => {
  const a4x3x8 = LABEL_PRESETS.find((p) => p.id === "a4-3x8")!;
  const config = (sheet: Partial<SheetLayout> = {}) => ({
    ...DEFAULT_CONFIG,
    widthMm: a4x3x8.widthMm,
    heightMm: a4x3x8.heightMm,
    sheet: { ...a4x3x8.sheet!, ...sheet },
  });

  test("leaves a sheet that fits where its margins put it", () => {
    for (const p of LABEL_PRESETS.filter((x) => x.sheet)) {
      const geo = sheetGeometry({ ...DEFAULT_CONFIG, widthMm: p.widthMm, heightMm: p.heightMm, sheet: p.sheet! });
      expect(geo.fits).toBe(true);
      expect(geo.scale).toBe(1);
      expect(geo.cell(0)).toEqual({ x: p.sheet!.marginLeftMm, y: p.sheet!.marginTopMm });
    }
  });

  test("shrinks the grid to fit inside the page padding and centres it", () => {
    const geo = sheetGeometry(config({ pagePaddingMm: 5 }));
    const [pw, ph] = PAGE_SIZES_MM.A4;
    expect(geo.scale).toBeCloseTo(200 / 210);
    const first = geo.cell(0);
    const last = geo.cell(23);
    expect(first.x).toBeCloseTo(5);
    expect(last.x + geo.labelW).toBeCloseTo(pw - 5);
    // The other way there's room to spare, split evenly top and bottom.
    expect(first.y).toBeCloseTo(ph - (last.y + geo.labelH));
    expect(first.y).toBeGreaterThanOrEqual(5);
    // Labels still touch: no padding between them, only around the page.
    expect(geo.cell(1).x).toBeCloseTo(first.x + geo.labelW);
    expect(geo.cell(3).y).toBeCloseTo(first.y + geo.labelH);
  });

  test("shrinks gaps along with the labels", () => {
    const geo = sheetGeometry(config({ gapXMm: 10, pagePaddingMm: 5 }));
    expect(geo.cell(1).x - geo.cell(0).x).toBeCloseTo((70 + 10) * geo.scale);
  });
});
