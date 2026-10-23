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

export const layoutSchema = z.object({
  qrPosition: z.enum(["left", "right", "top", "none"]).default("left"),
  qrScale: z.number().min(0.3).max(1).default(1),
  fields: z.array(z.enum(LABEL_FIELDS)).default(["brand", "material", "colorName", "nozzle", "bed", "code"]),
  fontScale: z.number().min(0.5).max(2).default(1),
  paddingMm: z.number().min(0).max(10).default(2),
  border: z.boolean().default(false),
  swatch: z.boolean().default(true),
  colorBand: z.boolean().default(false),
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

export type LabelPreset = { id: string; name: string; group: string; widthMm: number; heightMm: number; sheet?: SheetLayout };

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
    sheet: { page: "A4", cols: 3, rows: 8, marginTopMm: 0.5, marginLeftMm: 0, gapXMm: 0, gapYMm: 0 },
  },
  {
    id: "a4-2x7",
    name: "A4 sheet, 2 × 7 (99.1 × 38.1 mm)",
    group: "Sticker sheets",
    widthMm: 99.1,
    heightMm: 38.1,
    sheet: { page: "A4", cols: 2, rows: 7, marginTopMm: 15.15, marginLeftMm: 4.65, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: "letter-3x10",
    name: "Letter sheet, 3 × 10 (66.7 × 25.4 mm)",
    group: "Sticker sheets",
    widthMm: 66.7,
    heightMm: 25.4,
    sheet: { page: "Letter", cols: 3, rows: 10, marginTopMm: 12.7, marginLeftMm: 4.8, gapXMm: 3.2, gapYMm: 0 },
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
