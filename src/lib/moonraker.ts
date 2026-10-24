/** A small client for the parts of Moonraker's HTTP API (Klipper) that Spooldeck reads. */

export type PrintState = "standby" | "printing" | "paused" | "complete" | "cancelled" | "error";

export type PrinterStatus = {
  state: PrintState | string;
  /** The G-code file of the current or last job; empty when none is loaded. */
  filename: string;
  /** Filament Klipper has extruded for this job, in mm. */
  filamentMm: number;
  /** 0–1, or null when Klipper doesn't know. */
  progress: number | null;
  /** Klipper's status message, e.g. why a print failed. */
  message: string;
};

export class MoonrakerError extends Error {}

const TIMEOUT_MS = 5000;

/**
 * Turns what people paste into a base URL: adds http:// when the scheme is missing and drops
 * anything after the path, so "voron.local:7125" and "http://voron.local/#/" both work.
 */
export function normalizeMoonrakerUrl(input: string) {
  const value = input.trim();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

async function request(baseUrl: string, apiKey: string | null, path: string) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new MoonrakerError(timedOut ? "The printer didn't answer in time" : "Can't reach the printer");
  }
  if (res.status === 401 || res.status === 403) {
    throw new MoonrakerError(apiKey ? "Moonraker rejected the API key" : "Moonraker needs an API key");
  }
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
  if (!res.ok || !body?.result) {
    const message = body?.error?.message;
    if (res.status === 404 && !message) throw new MoonrakerError("This address isn't Moonraker");
    throw new MoonrakerError(message ? `Moonraker: ${message}` : `Moonraker answered with HTTP ${res.status}`);
  }
  return body.result;
}

/** Reads the print job state. Throws a MoonrakerError with a readable message when it can't. */
export async function queryPrinter(baseUrl: string, apiKey: string | null): Promise<PrinterStatus> {
  const result = (await request(baseUrl, apiKey, "/printer/objects/query?print_stats&display_status")) as {
    status?: {
      print_stats?: { state?: string; filename?: string; filament_used?: number; message?: string };
      display_status?: { progress?: number };
    };
  };
  const stats = result.status?.print_stats;
  if (!stats) throw new MoonrakerError("Moonraker didn't report a print status");
  const progress = result.status?.display_status?.progress;
  return {
    state: stats.state ?? "standby",
    filename: stats.filename ?? "",
    filamentMm: Number.isFinite(stats.filament_used) ? Math.max(0, stats.filament_used!) : 0,
    progress: typeof progress === "number" && Number.isFinite(progress) ? progress : null,
    message: stats.message ?? "",
  };
}
