/** Reads Klipper's print job through Moonraker's HTTP API. */

import { type Connection, PrinterError, printerJson } from "./http";
import { PRINT_STATES, type PrintState, type PrinterReading } from "./reading";

type Query = {
  result?: {
    status?: {
      print_stats?: { state?: string; filename?: string; filament_used?: number; message?: string };
      display_status?: { progress?: number };
      toolhead?: { extruder?: string };
    };
  };
};

/** "extruder" is tool 0, "extruder1" tool 1, and so on. */
function toolIndex(extruder: string | undefined) {
  const m = /^extruder(\d*)$/.exec(extruder ?? "");
  return m ? Number(m[1] || 0) : null;
}

export async function queryMoonraker(conn: Connection): Promise<PrinterReading> {
  const body = (await printerJson(conn, "/printer/objects/query?print_stats&display_status&toolhead=extruder", "Moonraker")) as Query | null;
  const stats = body?.result?.status?.print_stats;
  if (!stats) throw new PrinterError("Moonraker didn't report a print status");
  const progress = body?.result?.status?.display_status?.progress;
  const state = (PRINT_STATES as readonly string[]).includes(stats.state ?? "") ? (stats.state as PrintState) : "standby";
  return {
    state,
    jobKey: stats.filename || null,
    filename: stats.filename ?? "",
    counter: Number.isFinite(stats.filament_used) ? Math.max(0, stats.filament_used!) : 0,
    tool: toolIndex(body?.result?.status?.toolhead?.extruder),
    progress: typeof progress === "number" && Number.isFinite(progress) ? progress : null,
    message: stats.message ?? "",
  };
}
