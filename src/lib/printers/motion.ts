import type { PrinterMotion } from "@/db/schema";

export const MOTION_LABEL: Record<PrinterMotion, string> = { bedslinger: "Bedslinger", corexy: "CoreXY" };

export const MOTION_ABOUT: Record<PrinterMotion, string> = {
  bedslinger: "The bed slides back and forth, like an i3, Ender or Bambu A1.",
  corexy: "The head moves in a gantry over a bed that drops, like a Core One, Voron or Bambu X1.",
};

/** "Prusa Core One · CoreXY · Workshop", from whatever of these the printer has. */
export function printerSummary(p: { brand: string | null; model: string | null; motion: PrinterMotion | null; location: string | null }) {
  const makeModel = [p.brand, p.model].filter(Boolean).join(" ");
  return [makeModel, p.motion && MOTION_LABEL[p.motion], p.location].filter(Boolean).join(" · ");
}
