"use client";

import { useLayoutEffect, useRef } from "react";
import type { LabelData } from "@/lib/labels/data";
import type { LabelConfig } from "@/lib/labels/config";

const MIN_FIT = 0.3;

/** Scales a size in mm by the --fit factor that useFitText settles on. */
const fit = (mm: number) => `calc(${mm.toFixed(3)}mm * var(--fit, 1))`;

/**
 * Shrinks the text block until nothing overflows. The sizes computed in
 * LabelView are only an estimate; real glyph widths and line wrapping are
 * known only once the browser lays the label out (and again once fonts load).
 */
function useFitText() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflows = () => {
      const children = el.children;
      if (children.length === 0) return false;
      // Fractional rects, since tiny labels overflow by less than a whole pixel. A CSS
      // transform (the scaled designer preview) scales every rect alike, so comparing them still works.
      const box = el.getBoundingClientRect();
      const top = children[0].getBoundingClientRect().top;
      const bottom = children[children.length - 1].getBoundingClientRect().bottom;
      if (bottom - top > box.height + 0.1) return true;
      return [...el.querySelectorAll<HTMLElement>("[data-fit]")].some(
        (line) => line.scrollWidth > line.clientWidth + 0.5 || line.scrollHeight > line.clientHeight + 0.5,
      );
    };
    const run = () => {
      let factor = 1;
      el.style.setProperty("--fit", "1");
      while (factor > MIN_FIT && overflows()) {
        factor *= 0.93;
        el.style.setProperty("--fit", factor.toFixed(3));
      }
    };
    run();
    let active = true;
    document.fonts?.ready.then(() => active && run());
    return () => {
      active = false;
    };
  });
  return ref;
}

/**
 * A single physical label, sized in millimetres. Always black on white so it
 * prints the same on thermal and colour printers.
 */
export function LabelView({ data, config }: { data: LabelData; config: Pick<LabelConfig, "widthMm" | "heightMm" | "layout"> }) {
  const textRef = useFitText();
  const { widthMm: w, heightMm: h, layout } = config;
  const pad = layout.paddingMm;
  const has = (f: (typeof layout.fields)[number]) => layout.fields.includes(f) && !!data.values[f];
  const v = data.values;

  // The colour band gets its own strip of the label so it never overlaps the QR code or text,
  // plus at least 1 mm of white next to it so it can't merge into the QR code's quiet zone.
  const bandMm = layout.colorBand && data.colorHex ? Math.max(1.5, w * 0.03) : 0;
  const bandSide = layout.qrPosition === "right" ? "right" : "left";
  const bandPad = bandMm > 0 ? bandMm + Math.max(pad, 1) : pad;

  const vertical = layout.qrPosition === "top";
  const innerH = h - pad * 2;
  const innerW = w - pad - bandPad;
  const gapMm = Math.max(1, pad);
  const qrMm =
    layout.qrPosition === "none"
      ? 0
      : Math.max(5, (vertical ? Math.min(innerW, innerH * 0.55) : Math.min(innerH, innerW * 0.6)) * layout.qrScale);
  const textW = vertical || qrMm === 0 ? innerW : innerW - qrMm - gapMm;
  const textH = vertical && qrMm > 0 ? innerH - qrMm - gapMm : innerH;

  const title = (has("colorName") && v.colorName) || (has("filamentName") && v.filamentName) || v.colorName || v.filamentName;
  const subtitle = [has("brand") && v.brand, has("material") && v.material].filter(Boolean).join(" · ");
  const tempParts = [has("nozzle") && `N ${v.nozzle}`, has("bed") && `B ${v.bed}`].filter(Boolean) as string[];
  const extra = [
    has("filamentName") && has("colorName") ? v.filamentName : null,
    [has("diameter") && v.diameter, has("weight") && v.weight].filter(Boolean).join(" · "),
    [has("vendor") && v.vendor, has("price") && v.price].filter(Boolean).join(" · "),
    [has("purchaseDate") && v.purchaseDate, has("location") && v.location].filter(Boolean).join(" · "),
  ].filter(Boolean) as string[];

  // Starting sizes; useFitText shrinks them further if the text still doesn't fit.
  const lines = (subtitle ? 1 : 0) + tempParts.length + extra.length + (has("code") ? 1 : 0);
  const titleLines = (title?.length ?? 0) * 0.6 * Math.min(textW / 6, 7) > textW ? 2 : 1;
  const fitByHeight = textH / (lines * 1.35 + titleLines * 1.75);
  const bodyMm = Math.max(1, Math.min(fitByHeight, textW / 9, 5) * layout.fontScale);
  const titleMm = Math.max(1.4, Math.min(bodyMm * 1.6, textW / 5));
  // Nozzle and bed temps share a line only when it fits; otherwise one per line.
  const joinedTemps = tempParts.join("  ");
  const temps = tempParts.length > 1 && joinedTemps.length * 0.6 * bodyMm <= textW ? [joinedTemps] : tempParts;

  return (
    <div
      className="label relative box-border flex overflow-hidden bg-white text-black"
      style={{
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${pad}mm ${bandSide === "right" ? bandPad : pad}mm ${pad}mm ${bandSide === "left" ? bandPad : pad}mm`,
        gap: `${gapMm}mm`,
        flexDirection: vertical ? "column" : layout.qrPosition === "right" ? "row-reverse" : "row",
        alignItems: vertical ? "center" : "stretch",
        border: layout.border ? "0.3mm solid #000" : undefined,
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
        lineHeight: 1.15,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {bandMm > 0 && (
        <div aria-hidden className="absolute inset-y-0" style={{ [bandSide]: 0, width: `${bandMm}mm`, background: data.colorHex! }} />
      )}
      {qrMm > 0 && (
        <div
          className="shrink-0 self-center [&>svg]:block [&>svg]:size-full"
          style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}
          dangerouslySetInnerHTML={{ __html: data.qrSvg }}
        />
      )}
      <div
        ref={textRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden"
        style={{ gap: fit(bodyMm * 0.2), textAlign: vertical ? "center" : "left", width: vertical ? "100%" : undefined }}
      >
        {subtitle && (
          <div data-fit className="truncate" style={{ fontSize: fit(bodyMm) }}>
            {subtitle}
          </div>
        )}
        {title && (
          <div className="flex min-w-0 items-center" style={{ gap: fit(bodyMm * 0.5), justifyContent: vertical ? "center" : undefined }}>
            {layout.swatch && data.colorHex && (
              <span
                aria-hidden
                className="shrink-0 rounded-full"
                style={{ width: fit(titleMm * 0.85), height: fit(titleMm * 0.85), background: data.colorHex, border: "0.2mm solid #000" }}
              />
            )}
            <div data-fit className="line-clamp-2 min-w-0 font-bold" style={{ fontSize: fit(titleMm), lineHeight: 1.1 }}>
              {title}
            </div>
          </div>
        )}
        {temps.map((line) => (
          <div key={line} data-fit className="truncate font-semibold" style={{ fontSize: fit(bodyMm) }}>
            {line}
          </div>
        ))}
        {extra.map((line, i) => (
          <div key={i} data-fit className="truncate" style={{ fontSize: fit(bodyMm * 0.9) }}>
            {line}
          </div>
        ))}
        {has("code") && (
          <div data-fit className="truncate font-mono font-semibold tracking-wider" style={{ fontSize: fit(bodyMm) }}>
            #{data.code}
          </div>
        )}
      </div>
    </div>
  );
}
