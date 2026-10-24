import { eq } from "drizzle-orm";
import { db } from "@/db";
import { getSpoolRows } from "@/db/queries/spools";
import { type Printer, printers, usageLogs } from "@/db/schema";
import { MoonrakerError, type PrinterStatus, queryPrinter } from "@/lib/moonraker";
import { printNameFromFile } from "@/lib/slicer/parse";
import { gramsForLength } from "@/lib/weights";
import { syncStatus } from "@/server/services/spools";

/**
 * Keeps usage in step with Klipper printers. Every few seconds each printer's Moonraker is
 * asked for its print job; while a job runs, one usage entry on the loaded spool grows with
 * the filament Klipper has extruded. The job's state is stored on the printer row, so a
 * restart of Spooldeck mid-print carries on with the same entry.
 */

export type LiveStatus = {
  online: boolean;
  status: PrinterStatus | null;
  error: string | null;
  checkedAt: Date;
};

const POLL_MS = 3000;
const ACTIVE = new Set(["printing", "paused"]);
const ENDED: Record<string, string> = { complete: "Printed", cancelled: "Cancelled", error: "Failed" };
// The counter only grows during a job; a bigger drop than this means a new job.
const RESET_TOLERANCE_MM = 5;

type Job = Pick<Printer, "jobFile" | "jobUsageId" | "jobBaseMm" | "jobLastMm">;
const NO_JOB: Job = { jobFile: null, jobUsageId: null, jobBaseMm: 0, jobLastMm: 0 };

// On globalThis so instrumentation (which runs the loop) and route modules share one copy.
type SyncState = { started: boolean; live: Map<number, LiveStatus>; inflight: Map<number, Promise<void>> };
const g = globalThis as unknown as { __spooldeckPrinterSync?: SyncState };
const state = (g.__spooldeckPrinterSync ??= { started: false, live: new Map(), inflight: new Map() });

export function getLiveStatus(printerId: number): LiveStatus | null {
  return state.live.get(printerId) ?? null;
}

export function forgetLiveStatus(printerId: number) {
  state.live.delete(printerId);
}

/** Polls one printer and applies what it reports. Overlapping calls for a printer share one poll. */
export function pollPrinter(printerId: number): Promise<void> {
  const running = state.inflight.get(printerId);
  if (running) return running;
  const poll = (async () => {
    // Read inside the lock: the job columns must be the ones the previous poll wrote.
    const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId) });
    if (!printer) {
      state.live.delete(printerId);
      return;
    }
    let status: PrinterStatus;
    try {
      status = await queryPrinter(printer.url, printer.apiKey);
    } catch (e) {
      if (!(e instanceof MoonrakerError)) throw e;
      state.live.set(printerId, { online: false, status: null, error: e.message, checkedAt: new Date() });
      return;
    }
    state.live.set(printerId, { online: true, status, error: null, checkedAt: new Date() });
    await applyStatus(printer, status);
  })().finally(() => state.inflight.delete(printerId));
  state.inflight.set(printerId, poll);
  return poll;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function setNote(usageId: number | null, note: string) {
  if (usageId) await db.update(usageLogs).set({ note }).where(eq(usageLogs.id, usageId));
}

/** Moves the printer's tracked job one step forward from a fresh status. Exported for tests. */
export async function applyStatus(printer: Printer, status: PrinterStatus) {
  let job: Job = { jobFile: printer.jobFile, jobUsageId: printer.jobUsageId, jobBaseMm: printer.jobBaseMm, jobLastMm: printer.jobLastMm };
  const sameJob = job.jobFile !== null && job.jobFile === status.filename && status.filamentMm >= job.jobLastMm - RESET_TOLERANCE_MM;

  if (job.jobFile !== null && !sameJob) {
    // The tracked job is gone (another one started, or Klipper restarted); keep what was counted.
    await setNote(job.jobUsageId, `Printed on ${printer.name}`);
    job = NO_JOB;
  }
  if (job.jobFile === null) {
    if (!ACTIVE.has(status.state)) return saveJob(printer, job);
    job = { ...NO_JOB, jobFile: status.filename };
  }

  const mm = Math.max(status.filamentMm, job.jobLastMm);
  const ended = ENDED[status.state];
  let entry = job.jobUsageId
    ? await db.query.usageLogs.findFirst({ where: eq(usageLogs.id, job.jobUsageId), columns: { id: true, spoolId: true, grams: true } })
    : undefined;
  if (job.jobUsageId && entry?.spoolId !== printer.spoolId) {
    // Spool swapped or unloaded mid-print (or the entry was deleted): the next spool starts here.
    if (entry) await setNote(entry.id, `Printed on ${printer.name}`);
    job = { ...job, jobUsageId: null, jobBaseMm: job.jobLastMm };
    entry = undefined;
  }

  const [spool] = printer.spoolId ? await getSpoolRows([printer.spoolId]) : [];
  if (spool) {
    const grams = round2(gramsForLength(mm - job.jobBaseMm, spool.diameter, spool.density ?? undefined));
    const note = `${ended ?? "Printing"} on ${printer.name}`;
    if (entry) {
      if (entry.grams !== grams || ended) {
        await db.update(usageLogs).set({ grams, note }).where(eq(usageLogs.id, entry.id));
        await syncStatus(spool.id);
      }
    } else if (grams > 0) {
      const [row] = await db
        .insert(usageLogs)
        .values({ spoolId: spool.id, grams, kind: "print", printName: printNameFromFile(status.filename), note })
        .returning({ id: usageLogs.id });
      job = { ...job, jobUsageId: row.id };
      await syncStatus(spool.id);
    }
  }

  job = ended ? NO_JOB : { ...job, jobLastMm: mm };
  await saveJob(printer, job);
}

async function saveJob(printer: Printer, job: Job) {
  if (
    printer.jobFile === job.jobFile &&
    printer.jobUsageId === job.jobUsageId &&
    printer.jobBaseMm === job.jobBaseMm &&
    printer.jobLastMm === job.jobLastMm
  ) {
    return;
  }
  await db.update(printers).set(job).where(eq(printers.id, printer.id));
}

/** Starts the background loop once per server process. */
export function startPrinterSync() {
  if (state.started) return;
  state.started = true;
  const tick = async () => {
    try {
      const rows = await db.select({ id: printers.id }).from(printers);
      const ids = new Set(rows.map((r) => r.id));
      for (const id of state.live.keys()) if (!ids.has(id)) state.live.delete(id);
      await Promise.all(rows.map((r) => pollPrinter(r.id).catch((e) => console.error(`[printers] printer ${r.id}:`, e))));
    } catch (e) {
      console.error("[printers]", e);
    }
    setTimeout(tick, POLL_MS);
  };
  void tick();
}
