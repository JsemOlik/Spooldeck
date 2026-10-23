import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, decodeConfig, encodeConfig, LABEL_PRESETS, PAGE_SIZES_MM } from "@/lib/labels/config";

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
});
