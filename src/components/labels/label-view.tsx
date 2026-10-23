import type { LabelData } from "@/lib/labels/data";
import type { LabelConfig } from "@/lib/labels/config";

/**
 * A single physical label, sized in millimetres. Always black on white so it
 * prints the same on thermal and colour printers.
 */
export function LabelView({ data, config }: { data: LabelData; config: Pick<LabelConfig, "widthMm" | "heightMm" | "layout"> }) {
  const { widthMm: w, heightMm: h, layout } = config;
  const pad = layout.paddingMm;
  const has = (f: (typeof layout.fields)[number]) => layout.fields.includes(f) && !!data.values[f];
  const v = data.values;

  const vertical = layout.qrPosition === "top";
  const innerH = h - pad * 2;
  const innerW = w - pad * 2;
  const qrMm = layout.qrPosition === "none" ? 0 : Math.max(5, (vertical ? Math.min(innerW, innerH * 0.55) : Math.min(innerH, innerW * 0.6)) * layout.qrScale);

  const gapMm = Math.max(1, pad);
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

  // Fit the text block into the space left beside (or below) the QR code: body
  // lines count once, the title counts ~1.6× and may wrap once.
  const lines = (subtitle ? 1 : 0) + tempParts.length + extra.length + (has("code") ? 1 : 0);
  const titleLines = (title?.length ?? 0) > 12 ? 2 : 1;
  const fitByHeight = textH / (lines * 1.4 + titleLines * 1.8);
  const bodyMm = Math.max(1.2, Math.min(fitByHeight, textW / 10, 4.5) * layout.fontScale);
  const titleMm = Math.max(1.6, Math.min(bodyMm * 1.6, textW / 6));
  // Nozzle and bed temps share a line only when it fits; otherwise one per line.
  const joinedTemps = tempParts.join("  ");
  const temps = tempParts.length > 1 && joinedTemps.length * 0.6 * bodyMm <= textW ? [joinedTemps] : tempParts;

  return (
    <div
      className="label relative box-border flex overflow-hidden bg-white text-black"
      style={{
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${pad}mm`,
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
      {layout.colorBand && data.colorHex && (
        <div
          aria-hidden
          className="absolute inset-y-0"
          style={{ [layout.qrPosition === "right" ? "right" : "left"]: 0, width: `${Math.max(1.5, w * 0.03)}mm`, background: data.colorHex }}
        />
      )}
      {qrMm > 0 && (
        <div
          className="shrink-0 self-center [&>svg]:block [&>svg]:size-full"
          style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}
          dangerouslySetInnerHTML={{ __html: data.qrSvg }}
        />
      )}
      <div
        className="flex min-w-0 flex-1 flex-col justify-center"
        style={{ gap: `${bodyMm * 0.2}mm`, textAlign: vertical ? "center" : "left", width: vertical ? "100%" : undefined }}
      >
        {subtitle && (
          <div className="truncate" style={{ fontSize: `${bodyMm}mm` }}>
            {subtitle}
          </div>
        )}
        <div className="flex min-w-0 items-center" style={{ gap: `${bodyMm * 0.5}mm`, justifyContent: vertical ? "center" : undefined }}>
          {layout.swatch && data.colorHex && (
            <span
              aria-hidden
              className="shrink-0 rounded-full"
              style={{ width: `${titleMm * 0.85}mm`, height: `${titleMm * 0.85}mm`, background: data.colorHex, border: "0.2mm solid #000" }}
            />
          )}
          <div className="line-clamp-2 font-bold break-words" style={{ fontSize: `${titleMm}mm`, lineHeight: 1.05 }}>
            {title}
          </div>
        </div>
        {temps.map((line) => (
          <div key={line} className="truncate font-semibold" style={{ fontSize: `${bodyMm}mm` }}>
            {line}
          </div>
        ))}
        {extra.map((line, i) => (
          <div key={i} className="truncate" style={{ fontSize: `${bodyMm * 0.9}mm` }}>
            {line}
          </div>
        ))}
        {has("code") && (
          <div className="font-mono font-semibold tracking-wider" style={{ fontSize: `${bodyMm}mm` }}>
            #{data.code}
          </div>
        )}
      </div>
    </div>
  );
}
