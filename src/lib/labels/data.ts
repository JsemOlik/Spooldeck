import "server-only";
import type { LabelSpool } from "@/db/queries/spools";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { type Printer, type PrinterMotion, printers } from "@/db/schema";
import { formatDate, formatGrams, formatMoney, formatRange } from "@/lib/format";
import { MOTION_LABEL } from "@/lib/printers/motion";
import { printerUrl, qrSvg, spoolUrl } from "@/lib/qr";
import type { LabelField, PrinterLabelField } from "./config";

type LabelBase = {
  id: number;
  /** What the QR code opens. */
  url: string;
  qrSvg: string;
  /** The same QR code with more error correction, so a logo can cover its middle. */
  qrLogoSvg: string;
  colorHex: string | null;
};

export type SpoolLabelData = LabelBase & { kind: "spool"; code: string; values: Partial<Record<LabelField, string>> };

export type PrinterLabelData = LabelBase & {
  kind: "printer";
  name: string;
  motion: PrinterMotion | null;
  values: Partial<Record<PrinterLabelField, string>>;
};

export type LabelData = SpoolLabelData | PrinterLabelData;

async function qrCodes(url: string) {
  const [plain, logo] = await Promise.all([qrSvg(url), qrSvg(url, { ecl: "H" })]);
  return { url, qrSvg: plain, qrLogoSvg: logo };
}

export async function buildLabelData(spools: LabelSpool[], baseUrl: string, currency: string): Promise<SpoolLabelData[]> {
  return Promise.all(
    spools.map(async (s) => {
      const f = s.filament;
      const m = f.material;
      const nozzle = formatRange(f.nozzleMin ?? m?.nozzleMin, f.nozzleMax ?? m?.nozzleMax);
      const bed = formatRange(f.bedMin ?? m?.bedMin, f.bedMax ?? m?.bedMax);
      return {
        kind: "spool" as const,
        id: s.id,
        code: s.code,
        ...(await qrCodes(spoolUrl(baseUrl, s.code))),
        colorHex: f.colorHex,
        values: {
          brand: f.brand?.name ?? undefined,
          material: m?.name ?? undefined,
          colorName: f.colorName ?? undefined,
          filamentName: f.name,
          nozzle: nozzle === "—" ? undefined : nozzle,
          bed: bed === "—" ? undefined : bed,
          diameter: `${f.diameter} mm`,
          weight: formatGrams(s.initialWeight),
          purchaseDate: s.purchaseDate ? formatDate(s.purchaseDate) : undefined,
          vendor: s.vendor?.name ?? undefined,
          price: s.price != null ? formatMoney(s.price, s.currency ?? currency) : undefined,
          location: s.location ?? undefined,
          code: s.code,
        },
      };
    }),
  );
}

export async function sampleLabelData(baseUrl: string): Promise<SpoolLabelData> {
  return {
    kind: "spool",
    id: 0,
    code: "ABC123",
    ...(await qrCodes(spoolUrl(baseUrl, "ABC123"))),
    colorHex: "#ec6b1c",
    values: {
      brand: "Prusament",
      material: "PETG",
      colorName: "Prusa Orange",
      filamentName: "Prusament PETG Prusa Orange 1kg",
      nozzle: "240–260°C",
      bed: "70–90°C",
      diameter: "1.75 mm",
      weight: "1 kg",
      purchaseDate: formatDate(new Date()),
      vendor: "Prusa Research",
      price: formatMoney(24.99, "EUR"),
      location: "Dry box 1",
      code: "ABC123",
    },
  };
}

type LabelPrinter = Pick<Printer, "id" | "name" | "brand" | "model" | "motion" | "tools" | "location">;

const printerValues = (p: LabelPrinter): PrinterLabelData["values"] => ({
  brand: p.brand ?? undefined,
  model: p.model ?? undefined,
  motion: p.motion ? MOTION_LABEL[p.motion] : undefined,
  tools: p.tools > 1 ? `${p.tools} tools` : undefined,
  location: p.location ?? undefined,
});

export async function buildPrinterLabelData(printers: LabelPrinter[], baseUrl: string): Promise<PrinterLabelData[]> {
  return Promise.all(
    printers.map(async (p) => ({
      kind: "printer" as const,
      id: p.id,
      name: p.name,
      motion: p.motion,
      ...(await qrCodes(printerUrl(baseUrl, p.id))),
      colorHex: null,
      values: printerValues(p),
    })),
  );
}

export async function samplePrinterLabelData(baseUrl: string): Promise<PrinterLabelData> {
  const p = { id: 1, name: "Kurapika", brand: "Prusa", model: "Core One", motion: "corexy", tools: 1, location: "Workshop" } as const;
  return { kind: "printer", id: 0, name: p.name, motion: p.motion, ...(await qrCodes(printerUrl(baseUrl, p.id))), colorHex: null, values: printerValues(p) };
}

const LABEL_COLUMNS = { id: true, name: true, brand: true, model: true, motion: true, tools: true, location: true } as const;

/** The printers to print labels for, in the order given, or all of them by name. */
export async function getPrintersForLabels(ids?: number[]) {
  if (!ids) return db.query.printers.findMany({ columns: LABEL_COLUMNS, orderBy: [asc(printers.name), asc(printers.id)] });
  if (ids.length === 0) return [];
  const rows = await db.query.printers.findMany({ where: inArray(printers.id, ids), columns: LABEL_COLUMNS });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
