/** Reads the print job of a Prusa printer (MK4, XL, MINI, Core One, MK3 with Prusa-Link) through PrusaLink. */

import { type SlicedFilament, SlicerParseError, sliceInfoFromMetadata } from "@/lib/slicer/parse";
import { parseSlicedStream } from "@/lib/slicer/stream";
import { type Connection, PrinterError, printerGet, printerJson } from "./http";
import type { PrintState, PrinterReading } from "./reading";

type Job = {
  id?: number;
  state?: string;
  progress?: number;
  file?: { name?: string; display_name?: string; path?: string; refs?: { download?: string }; meta?: Record<string, unknown> };
};

const STATES: Record<string, PrintState> = {
  PRINTING: "printing",
  PAUSED: "paused",
  FINISHED: "complete",
  STOPPED: "cancelled",
  ERROR: "error",
};

export async function queryPrusaLink(conn: Connection): Promise<PrinterReading> {
  // 204 No Content when the printer has no job.
  const job = (await printerJson(conn, "/api/v1/job", "PrusaLink")) as Job | null;
  if (!job) return { state: "standby", jobKey: null, filename: "", counter: 0, tool: null, progress: null, message: "" };
  if (job.id == null) throw new PrinterError("PrusaLink didn't report a job id");

  const file = job.file;
  const progress = Number.isFinite(job.progress) ? Math.min(1, Math.max(0, job.progress! / 100)) : 0;
  const meta = file?.meta
    ? Object.fromEntries(Object.entries(file.meta).flatMap(([k, v]) => (v == null || typeof v === "object" ? [] : [[k, String(v)]])))
    : null;
  return {
    state: STATES[job.state ?? ""] ?? "error",
    jobKey: String(job.id),
    filename: file?.display_name || file?.name || "",
    counter: progress,
    tool: null,
    progress,
    message: "",
    download: file?.refs?.download ?? (file?.path && file.name ? `${file.path.replace(/\/+$/, "")}/${file.name}` : null),
    meta,
  };
}

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * The filament a PrusaLink job uses, per extruder or MMU slot. Prusa-Link on the MK3 lists the
 * slicer's stats with the job; otherwise the print file is downloaded and read (a .bgcode only up
 * to its metadata). Throws SlicerParseError when the file has no usage stats, PrinterError when
 * the download fails.
 */
export async function readJobFilaments(conn: Connection, reading: PrinterReading): Promise<SlicedFilament[]> {
  if (reading.meta && (reading.meta["filament used [g]"] || reading.meta["filament used [mm]"])) {
    return sliceInfoFromMetadata(reading.meta, "gcode", reading.filename).filaments;
  }
  if (!reading.download) throw new PrinterError("PrusaLink didn't say where the print file is");
  const res = await printerGet(conn, reading.download, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new PrinterError(`Couldn't download the print file (HTTP ${res.status})`);
  }
  try {
    return (await parseSlicedStream(res.body, reading.filename)).filaments;
  } catch (e) {
    if (e instanceof SlicerParseError) throw e;
    throw new PrinterError("The print file download broke off");
  }
}
