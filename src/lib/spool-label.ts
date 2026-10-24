import { formatGrams } from "@/lib/format";

export type SpoolChoice = {
  id: number;
  code: string;
  remaining: number;
  filamentName: string;
  colorName: string | null;
  colorHex: string | null;
  brandName: string | null;
};

export function spoolLabel(s: SpoolChoice) {
  // Imported Prusament filaments are already named "Prusament PLA …", so don't repeat the brand.
  const hasBrand = !s.brandName || s.filamentName.toLowerCase().startsWith(s.brandName.toLowerCase());
  const name = hasBrand ? s.filamentName : `${s.brandName} ${s.filamentName}`;
  const color = s.colorName && !name.toLowerCase().includes(s.colorName.toLowerCase()) ? ` · ${s.colorName}` : "";
  return `${name}${color} · ${formatGrams(Math.max(0, s.remaining))} left · ${s.code}`;
}
