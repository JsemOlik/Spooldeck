import { z } from "zod";

export const LABEL_FIELDS = [
  "brand",
  "material",
  "colorName",
  "filamentName",
  "nozzle",
  "bed",
  "diameter",
  "weight",
  "purchaseDate",
  "vendor",
  "price",
  "location",
  "code",
] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];

export const LABEL_FIELD_LABELS: Record<LabelField, string> = {
  brand: "Brand",
  material: "Material",
  colorName: "Color name",
  filamentName: "Product name",
  nozzle: "Nozzle temp",
  bed: "Bed temp",
  diameter: "Diameter",
  weight: "Net weight",
  purchaseDate: "Purchase date",
  vendor: "Bought from",
  price: "Price",
  location: "Location",
  code: "Spool code",
};

/** What a printer's label can show besides its name. */
export const PRINTER_LABEL_FIELDS = ["brand", "model", "motion", "tools", "location"] as const;
export type PrinterLabelField = (typeof PRINTER_LABEL_FIELDS)[number];

export const PRINTER_LABEL_FIELD_LABELS: Record<PrinterLabelField, string> = {
  brand: "Brand",
  model: "Model",
  motion: "Motion system",
  tools: "Tools",
  location: "Location",
};

/** Labels for spools, or for printers (their QR code opens the printer's page). */
export const LABEL_SUBJECTS = ["spools", "printers"] as const;
export type LabelSubject = (typeof LABEL_SUBJECTS)[number];

export const layoutSchema = z.object({
  qrPosition: z.enum(["left", "right", "top", "none"]).default("left"),
  qrScale: z.number().min(0.3).max(1).default(1),
  fields: z.array(z.enum(LABEL_FIELDS)).default(["brand", "material", "colorName", "code"]),
  /** The fields on printer labels, which share the rest of the layout with spool labels. */
  printerFields: z.array(z.enum(PRINTER_LABEL_FIELDS)).default(["brand", "model", "motion", "tools", "location"]),
  fontScale: z.number().min(0.5).max(2).default(1),
  paddingMm: z.number().min(0).max(10).default(2),
  border: z.boolean().default(false),
  /** A bar in the filament's colour under the text. */
  colorBar: z.boolean().default(true),
  /** A colour dot next to the title. */
  swatch: z.boolean().default(false),
  /** A strip of colour along the label's edge. */
  colorBand: z.boolean().default(false),
  /** The Spooldeck spool in the middle of the QR code, on the filament's colour. */
  qrLogo: z.boolean().default(true),
});
export type LabelLayout = z.infer<typeof layoutSchema>;

export const sheetSchema = z.object({
  page: z.enum(["A4", "Letter"]),
  cols: z.number().int().min(1).max(10),
  rows: z.number().int().min(1).max(40),
  marginTopMm: z.number().min(0).max(100),
  marginLeftMm: z.number().min(0).max(100),
  gapXMm: z.number().min(0).max(50),
  gapYMm: z.number().min(0).max(50),
  /** Space kept clear along the paper's edges, for printers that can't print to the edge. */
  pagePaddingMm: z.number().min(0).max(30).default(0),
});
export type SheetLayout = z.infer<typeof sheetSchema>;

export const labelConfigSchema = z.object({
  widthMm: z.number().min(10).max(300),
  heightMm: z.number().min(8).max(300),
  layout: layoutSchema,
  sheet: sheetSchema.nullable().default(null),
});
export type LabelConfig = z.infer<typeof labelConfigSchema>;

export const PAGE_SIZES_MM = { A4: [210, 297], Letter: [215.9, 279.4] } as const;

/**
 * Where the labels sit on a sheet. Labels stay pagePaddingMm clear of the paper's edges: a grid that
 * doesn't fit inside that is centred and, if it's too big, shrunk evenly until it fits.
 */
export function sheetGeometry({ widthMm: w, heightMm: h, sheet }: LabelConfig & { sheet: SheetLayout }) {
  const [pageW, pageH] = PAGE_SIZES_MM[sheet.page];
  const pad = sheet.pagePaddingMm;
  const gridW = sheet.cols * w + (sheet.cols - 1) * sheet.gapXMm;
  const gridH = sheet.rows * h + (sheet.rows - 1) * sheet.gapYMm;
  // A little slack so presets measured to the hundredth of a millimetre still count as fitting.
  const slack = 0.5;
  const fits =
    sheet.marginLeftMm >= pad - slack &&
    sheet.marginTopMm >= pad - slack &&
    sheet.marginLeftMm + gridW <= pageW - pad + slack &&
    sheet.marginTopMm + gridH <= pageH - pad + slack;
  const scale = fits ? 1 : Math.min(1, (pageW - 2 * pad) / gridW, (pageH - 2 * pad) / gridH);
  const left = fits ? sheet.marginLeftMm : (pageW - gridW * scale) / 2;
  const top = fits ? sheet.marginTopMm : (pageH - gridH * scale) / 2;
  return {
    pageW,
    pageH,
    /** 1 unless the grid had to shrink to fit. */
    scale,
    /** Whether the grid sits where the margins put it (false: centred to stay inside the padding). */
    fits,
    gridW,
    gridH,
    labelW: w * scale,
    labelH: h * scale,
    cell: (i: number) => ({
      x: left + (i % sheet.cols) * (w + sheet.gapXMm) * scale,
      y: top + Math.floor(i / sheet.cols) * (h + sheet.gapYMm) * scale,
    }),
  };
}

export type LabelPreset ={ id: string; name: string; group: string; widthMm: number; heightMm: number; sheet?: SheetLayout };

export const LABEL_PRESETS: LabelPreset[] = [
  { id: "62x29", name: "62 × 29 mm", group: "Brother QL", widthMm: 62, heightMm: 29 },
  { id: "62x100", name: "62 × 100 mm", group: "Brother QL", widthMm: 62, heightMm: 100 },
  { id: "50x30", name: "50 × 30 mm", group: "Thermal", widthMm: 50, heightMm: 30 },
  { id: "40x30", name: "40 × 30 mm", group: "Thermal", widthMm: 40, heightMm: 30 },
  { id: "40x12", name: "40 × 12 mm", group: "Niimbot / Dymo", widthMm: 40, heightMm: 12 },
  { id: "54x25", name: "54 × 25 mm", group: "Niimbot / Dymo", widthMm: 54, heightMm: 25 },
  { id: "100x50", name: "100 × 50 mm", group: "Thermal", widthMm: 100, heightMm: 50 },
  {
    id: "a4-3x8",
    name: "A4 sheet, 3 × 8 (70 × 37 mm)",
    group: "Sticker sheets",
    widthMm: 70,
    heightMm: 37,
    sheet: { page: "A4", cols: 3, rows: 8, marginTopMm: 0.5, marginLeftMm: 0, gapXMm: 0, gapYMm: 0, pagePaddingMm: 0 },
  },
  {
    id: "a4-2x7",
    name: "A4 sheet, 2 × 7 (99.1 × 38.1 mm)",
    group: "Sticker sheets",
    widthMm: 99.1,
    heightMm: 38.1,
    sheet: { page: "A4", cols: 2, rows: 7, marginTopMm: 15.15, marginLeftMm: 4.65, gapXMm: 2.5, gapYMm: 0, pagePaddingMm: 0 },
  },
  {
    id: "letter-3x10",
    name: "Letter sheet, 3 × 10 (66.7 × 25.4 mm)",
    group: "Sticker sheets",
    widthMm: 66.7,
    heightMm: 25.4,
    sheet: { page: "Letter", cols: 3, rows: 10, marginTopMm: 12.7, marginLeftMm: 4.8, gapXMm: 3.2, gapYMm: 0, pagePaddingMm: 0 },
  },
];

export const DEFAULT_LAYOUT: LabelLayout = layoutSchema.parse({});

export const DEFAULT_CONFIG: LabelConfig = { widthMm: 50, heightMm: 30, layout: DEFAULT_LAYOUT, sheet: null };

export function encodeConfig(config: LabelConfig) {
  const json = JSON.stringify(config);
  return typeof window === "undefined"
    ? Buffer.from(json).toString("base64url")
    : btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(value: string | undefined | null): LabelConfig | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = labelConfigSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
