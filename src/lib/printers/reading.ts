/** What one poll of a printer tells Spooldeck, the same shape for Klipper and PrusaLink. */

export const PRINT_STATES = ["standby", "printing", "paused", "complete", "cancelled", "error"] as const;
export type PrintState = (typeof PRINT_STATES)[number];

export type PrinterReading = {
  state: PrintState;
  /** Tells jobs apart: Klipper's file name, or PrusaLink's job id. Null when there's no job. */
  jobKey: string | null;
  /** The job's file name as people know it; empty when there's no job. */
  filename: string;
  /**
   * How far the job has got, in the printer's own measure. Klipper: filament extruded (mm).
   * PrusaLink: fraction of the print done (0–1), since it doesn't report filament.
   */
  counter: number;
  /** The tool extruding now (Klipper toolchangers); null when unknown. */
  tool: number | null;
  /** 0–1, or null when the printer doesn't know. */
  progress: number | null;
  /** The printer's status message, e.g. why a print failed. */
  message: string;
  /** PrusaLink: where to download the print file, and the usage stats it already lists, if any. */
  download?: string | null;
  meta?: Record<string, string> | null;
};
