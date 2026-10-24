import "server-only";
import type { LabelSpool } from "@/db/queries/spools";
import { formatDate, formatGrams, formatMoney, formatRange } from "@/lib/format";
import { qrSvg, spoolUrl } from "@/lib/qr";
import type { LabelField } from "./config";

export type LabelData = {
  id: number;
  code: string;
  qrSvg: string;
  /** The same QR code with more error correction, so a logo can cover its middle. */
  qrLogoSvg: string;
  colorHex: string | null;
  values: Partial<Record<LabelField, string>>;
};

async function qrCodes(url: string) {
  const [plain, logo] = await Promise.all([qrSvg(url), qrSvg(url, { ecl: "H" })]);
  return { qrSvg: plain, qrLogoSvg: logo };
}

export async function buildLabelData(spools: LabelSpool[], baseUrl: string, currency: string): Promise<LabelData[]> {
  return Promise.all(
    spools.map(async (s) => {
      const f = s.filament;
      const m = f.material;
      const nozzle = formatRange(f.nozzleMin ?? m?.nozzleMin, f.nozzleMax ?? m?.nozzleMax);
      const bed = formatRange(f.bedMin ?? m?.bedMin, f.bedMax ?? m?.bedMax);
      return {
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

export async function sampleLabelData(baseUrl: string): Promise<LabelData> {
  return {
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
