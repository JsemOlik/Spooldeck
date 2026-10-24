"use client";

import { useLayoutEffect, useRef } from "react";
import type { LabelData } from "@/lib/labels/data";
import type { LabelConfig, LabelLayout, PrinterLabelField } from "@/lib/labels/config";

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
      // Single lines only overflow sideways (their glyphs can poke a little above or below the
      // line box at any size); a clamped title overflows when a line is cut off.
      return [...el.querySelectorAll<HTMLElement>("[data-fit]")].some((line) =>
        line.dataset.fit === "clamp"
          ? line.scrollHeight > line.clientHeight + parseFloat(getComputedStyle(line).fontSize) * 0.4
          : line.scrollWidth > line.clientWidth + 0.5,
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

/** Mixes a hex colour towards black (amount > 0) or white (amount < 0). */
function shade(hex: string, amount: number) {
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${rgb.map((c) => Math.round(c + (target - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

function isDark(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

/** Spooldeck's orange (the app's primary colour and icon), as a hex value since labels print outside the theme. */
const BRAND_HEX = "#df5200";

/**
 * The middle of the QR code: on a spool's label, Spooldeck's spool on a tile of the filament's
 * colour; on a printer's label, Spooldeck's own icon (src/app/icon.svg). The white margin keeps it
 * apart from the modules around it; the code's high error correction covers it.
 */
function QrLogo({ color, printer }: { color: string | null; printer?: boolean }) {
  if (printer) {
    return (
      <svg viewBox="0 0 32 32" aria-hidden className="absolute top-1/2 left-1/2 size-[26%] -translate-1/2">
        <circle cx="16" cy="16" r="16" fill="#ffffff" />
        <circle cx="16" cy="16" r="13.5" fill={BRAND_HEX} />
        <circle cx="16" cy="16" r="8.55" fill="none" stroke="#ffffff" strokeWidth="2.16" strokeDasharray="2.88 2.07" />
        <circle cx="16" cy="16" r="3.96" fill="#ffffff" />
      </svg>
    );
  }
  const tile = color ?? "#000000";
  // The spool is black on light colours and white on dark ones, the hub the opposite.
  const [spool, hub] = isDark(tile) ? ["#ffffff", "#000000"] : ["#000000", "#ffffff"];
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="absolute top-1/2 left-1/2 size-[26%] -translate-1/2">
      <rect width="32" height="32" rx="7" fill="#ffffff" />
      <rect x="2.5" y="2.5" width="27" height="27" rx="5.5" fill={tile} />
      <circle cx="16" cy="16" r="9.6" fill={spool} />
      <circle cx="16" cy="16" r="6" fill="none" stroke={hub} strokeWidth="1.6" strokeDasharray="2.1 1.6" />
      <circle cx="16" cy="16" r="2.7" fill={hub} />
    </svg>
  );
}

/** The label's lines of text, from the fields the layout shows. */
function labelText(data: LabelData, layout: LabelLayout) {
  if (data.kind === "printer") {
    const v = data.values;
    const has = (f: PrinterLabelField) => layout.printerFields.includes(f) && !!v[f];
    // The model gets a line of its own: "Brand Model" on the brand's short line would shrink everything.
    return {
      brand: has("brand") ? v.brand : undefined,
      title: data.name,
      footer: has("location") ? v.location! : "",
      tempParts: [] as string[],
      extra: [has("model") && v.model, [has("motion") && v.motion, has("tools") && v.tools].filter(Boolean).join(" · ")].filter(Boolean) as string[],
    };
  }
  const v = data.values;
  const has = (f: (typeof layout.fields)[number]) => layout.fields.includes(f) && !!v[f];
  return {
    brand: has("brand") ? v.brand : undefined,
    title: (has("colorName") && v.colorName) || (has("filamentName") && v.filamentName) || v.colorName || v.filamentName,
    footer: [has("material") && v.material, has("code") && `#${data.code}`].filter(Boolean).join(" · "),
    tempParts: [has("nozzle") && `Nozzle ${v.nozzle}`, has("bed") && `Bed ${v.bed}`].filter(Boolean) as string[],
    extra: [
      has("filamentName") && has("colorName") ? v.filamentName : null,
      [has("diameter") && v.diameter, has("weight") && v.weight].filter(Boolean).join(" · "),
      [has("vendor") && v.vendor, has("price") && v.price].filter(Boolean).join(" · "),
      [has("purchaseDate") && v.purchaseDate, has("location") && v.location].filter(Boolean).join(" · "),
    ].filter(Boolean) as string[],
  };
}

/**
 * A single physical label, for a spool or a printer, sized in millimetres. The QR code and title
 * are black on white; the brand and footer are dark grey, and the colour bar and logo print in the
 * filament's colour (or as grey on a thermal printer).
 */
export function LabelView({ data, config }: { data: LabelData; config: Pick<LabelConfig, "widthMm" | "heightMm" | "layout"> }) {
  const textRef = useFitText();
  const { widthMm: w, heightMm: h, layout } = config;
  const pad = layout.paddingMm;
  const color = data.colorHex;

  // The colour band gets its own strip of the label so it never overlaps the QR code or text,
  // plus at least 1 mm of white next to it so it can't merge into the QR code's quiet zone.
  const bandMm = layout.colorBand && color ? Math.max(1.5, w * 0.03) : 0;
  const bandSide = layout.qrPosition === "right" ? "right" : "left";
  const bandPad = bandMm > 0 ? bandMm + Math.max(pad, 1) : pad;

  const vertical = layout.qrPosition === "top";
  const innerH = h - pad * 2;
  const innerW = w - pad - bandPad;
  const gapMm = Math.max(1.5, pad, Math.min(innerW, innerH) * 0.08);
  const qrMm =
    layout.qrPosition === "none"
      ? 0
      : Math.max(5, (vertical ? Math.min(innerW, innerH * 0.55) : Math.min(innerH, innerW * 0.5)) * layout.qrScale);
  const textW = vertical || qrMm === 0 ? innerW : innerW - qrMm - gapMm;
  const textH = vertical && qrMm > 0 ? innerH - qrMm - gapMm : innerH;
  const logo = layout.qrLogo && qrMm >= 8;

  const { brand, title, footer, tempParts, extra } = labelText(data, layout);

  // The bar is a fixed size; the text shares what's left.
  const barMm = layout.colorBar && color ? Math.min(7, Math.max(1.5, textH * 0.17)) : 0;
  const barGapMm = barMm > 0 ? Math.max(0.6, barMm * 0.3) : 0;

  // Starting sizes; useFitText shrinks them further if the text still doesn't fit.
  const titleRatio = 1.3;
  const detailRatio = 0.78;
  const titleLines = (title?.length ?? 0) * 0.6 * Math.min(textW / 6, 7) * titleRatio > textW ? 2 : 1;
  const textLines = (brand ? 1 : 0) + titleLines * titleRatio + (footer ? 1 : 0);
  // Nozzle and bed temps share a line only when it fits; otherwise one per line.
  const roughBody = Math.min((textH - barMm - barGapMm) / ((textLines + (tempParts.length + extra.length) * detailRatio) * 1.3), textW / 8, 5.5);
  const joinedTemps = tempParts.join(" · ");
  const temps = tempParts.length > 1 && joinedTemps.length * 0.55 * roughBody * detailRatio <= textW ? [joinedTemps] : tempParts;
  const details = [...temps, ...extra];
  const fitByHeight = (textH - barMm - barGapMm) / ((textLines + details.length * detailRatio) * 1.3 + 0.4);
  const bodyMm = Math.max(1, Math.min(fitByHeight, textW / 8, 5.5) * layout.fontScale);
  const titleMm = Math.max(1.4, Math.min(bodyMm * titleRatio, textW / 4.5));
  const detailMm = bodyMm * detailRatio;
  const align = vertical ? "center" : "left";

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
      {bandMm > 0 && <div aria-hidden className="absolute inset-y-0" style={{ [bandSide]: 0, width: `${bandMm}mm`, background: color! }} />}
      {qrMm > 0 && (
        <div className="relative shrink-0 self-center" style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}>
          <div className="size-full [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: logo ? data.qrLogoSvg : data.qrSvg }} />
          {logo && <QrLogo color={color} printer={data.kind === "printer"} />}
        </div>
      )}
      <div
        ref={textRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col justify-between overflow-hidden"
        style={{ gap: fit(bodyMm * 0.35), textAlign: align, width: vertical ? "100%" : undefined }}
      >
        {(brand || title) && (
          <div className="grid min-w-0" style={{ gap: fit(bodyMm * 0.1) }}>
            {brand && (
              <div data-fit className="truncate" style={{ fontSize: fit(bodyMm), color: "#4a4a4a" }}>
                {brand}
              </div>
            )}
            {title && (
              <div className="flex min-w-0 items-center" style={{ gap: fit(bodyMm * 0.4), justifyContent: vertical ? "center" : undefined }}>
                {layout.swatch && color && (
                  <span
                    aria-hidden
                    className="shrink-0 rounded-full"
                    style={{ width: fit(titleMm * 0.8), height: fit(titleMm * 0.8), background: color, border: `0.2mm solid ${shade(color, 0.35)}` }}
                  />
                )}
                <div
                  data-fit="clamp"
                  className="line-clamp-2 min-w-0 font-bold"
                  style={{ fontSize: fit(titleMm), lineHeight: 1.08, letterSpacing: "-0.01em" }}
                >
                  {title}
                </div>
              </div>
            )}
          </div>
        )}
        {details.length > 0 && (
          <div className="grid min-w-0" style={{ gap: fit(detailMm * 0.15) }}>
            {details.map((line, i) => (
              <div key={i} data-fit className="truncate font-medium" style={{ fontSize: fit(detailMm) }}>
                {line}
              </div>
            ))}
          </div>
        )}
        {(footer || barMm > 0) && (
          <div className="grid min-w-0" style={{ gap: `${barGapMm}mm` }}>
            {footer && (
              <div data-fit className="truncate" style={{ fontSize: fit(bodyMm), color: "#4a4a4a" }}>
                {footer}
              </div>
            )}
            {barMm > 0 && (
              <div
                aria-hidden
                className="box-border w-full"
                style={{
                  height: `${barMm}mm`,
                  background: color!,
                  border: `0.25mm solid ${shade(color!, 0.3)}`,
                  borderRadius: `${Math.min(barMm * 0.28, 1.5)}mm`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
