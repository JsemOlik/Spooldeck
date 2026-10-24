import { eq } from "drizzle-orm";
import { db } from "@/db";
import { getSpoolRows } from "@/db/queries/spools";
import { type Printer, type PrinterJob, printers, usageLogs } from "@/db/schema";
import { type Connection, PrinterError } from "@/lib/printers/http";
import { queryMoonraker } from "@/lib/printers/moonraker";
import { queryPrusaLink, readJobFilaments } from "@/lib/printers/prusalink";
import type { PrinterReading } from "@/lib/printers/reading";
import { gramsFor } from "@/lib/slicer/match";
import { SlicerParseError, printNameFromFile } from "@/lib/slicer/parse";
import { gramsForLength } from "@/lib/weights";
import { syncStatus } from "@/server/services/spools";

/**
 * Keeps usage in step with connected printers. Every few seconds each printer is asked for its
 * print job; while a job runs, each tool's loaded spool has one usage entry that grows with the
 * job. Klipper reports the filament extruded, which goes to the active extruder. PrusaLink only
 * reports progress, so the print file is read once for the filament per tool, and each spool
 * gets its tool's share times the progress. The job is stored on the printer row, so a restart
 * of Spooldeck mid-print carries on with the same entries.
 */

export type LiveStatus = {
  online: boolean;
  status: PrinterReading | null;
  error: string | null;
  checkedAt: Date;
};

const POLL_MS = 3000;
const ACTIVE = new Set(["printing", "paused"]);
const ENDED: Record<string, string> = { complete: "Printed", cancelled: "Cancelled", error: "Failed" };
// Klipper's counter only grows during a job; a bigger drop than this means a new job.
const RESET_TOLERANCE_MM = 5;
// After a failed print file download, wait this long before trying again.
const FILE_RETRY_MS = 30_000;

/** A print file being read in the background; `filaments` once done (null: no usage stats in it). */
type FileRead = { key: string; promise: Promise<void>; filaments?: PrinterJob["filaments"]; failedAt?: number };

// On globalThis so instrumentation (which runs the loop) and route modules share one copy.
type SyncState = {
  started: boolean;
  live: Map<number, LiveStatus>;
  inflight: Map<number, Promise<void>>;
  files: Map<number, FileRead>;
};
const g = globalThis as unknown as { __spooldeckPrinterSync?: SyncState };
const state = (g.__spooldeckPrinterSync ??= { started: false, live: new Map(), inflight: new Map(), files: new Map() });

export function getLiveStatus(printerId: number): LiveStatus | null {
  return state.live.get(printerId) ?? null;
}

export function forgetLiveStatus(printerId: number) {
  state.live.delete(printerId);
  state.files.delete(printerId);
}

/** Resolves once the printer's print file has been read (and the result applied). For tests. */
export function printFileRead(printerId: number) {
  return state.files.get(printerId)?.promise;
}

const connection = (p: Printer): Connection => ({ url: p.url, username: p.username, apiKey: p.apiKey });

/** Polls one printer and applies what it reports. Overlapping calls for a printer share one poll. */
export function pollPrinter(printerId: number): Promise<void> {
  const running = state.inflight.get(printerId);
  if (running) return running;
  const poll = (async () => {
    // Read inside the lock: the job must be the one the previous poll wrote.
    const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId), with: { spools: true } });
    if (!printer) {
      forgetLiveStatus(printerId);
      return;
    }
    let reading: PrinterReading;
    try {
      reading = await (printer.kind === "prusalink" ? queryPrusaLink : queryMoonraker)(connection(printer));
    } catch (e) {
      if (!(e instanceof PrinterError)) throw e;
      state.live.set(printerId, { online: false, status: null, error: e.message, checkedAt: new Date() });
      return;
    }
    state.live.set(printerId, { online: true, status: reading, error: null, checkedAt: new Date() });
    await applyReading(printer, printer.spools, reading);
  })().finally(() => state.inflight.delete(printerId));
  state.inflight.set(printerId, poll);
  return poll;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function setNote(usageId: number, note: string) {
  await db.update(usageLogs).set({ note }).where(eq(usageLogs.id, usageId));
}

function sameJob(printer: Printer, job: PrinterJob, reading: PrinterReading) {
  if (job.key !== reading.jobKey) return false;
  return printer.kind !== "moonraker" || reading.counter >= job.counter - RESET_TOLERANCE_MM;
}

/**
 * The filament per tool of a PrusaLink job, from a print file read in the background so a slow
 * download doesn't hold up polling. Undefined until it's known.
 */
function jobFilaments(printer: Printer, reading: PrinterReading): PrinterJob["filaments"] {
  const key = reading.jobKey ?? "";
  const read = state.files.get(printer.id);
  if (read?.key === key) {
    if (read.filaments !== undefined) {
      state.files.delete(printer.id);
      return read.filaments;
    }
    if (!read.failedAt || Date.now() - read.failedAt < FILE_RETRY_MS) return undefined;
  }
  const next: FileRead = { key, promise: Promise.resolve() };
  next.promise = readJobFilaments(connection(printer), reading)
    .then((filaments) => {
      next.filaments = filaments.map(({ index, grams, cm3, mm }) => ({ index, grams, cm3, mm }));
    })
    .catch((e) => {
      if (e instanceof SlicerParseError) next.filaments = null;
      else {
        if (!(e instanceof PrinterError)) console.error(`[printers] printer ${printer.id}:`, e);
        next.failedAt = Date.now();
      }
    })
    // Apply it now rather than on the next tick.
    .then(() => (next.filaments !== undefined && state.files.get(printer.id) === next ? pollPrinter(printer.id) : undefined))
    .catch((e) => console.error(`[printers] printer ${printer.id}:`, e));
  state.files.set(printer.id, next);
  return undefined;
}

/** Moves the printer's tracked job one step forward from a fresh reading. Exported for tests. */
export async function applyReading(printer: Printer, loaded: { tool: number; spoolId: number }[], reading: PrinterReading) {
  const prusa = printer.kind === "prusalink";
  let job = printer.job;

  if (job && !sameJob(printer, job, reading)) {
    // The tracked job is gone (another one started, or the printer restarted); keep what was counted.
    for (const e of job.entries) await setNote(e.usageId, `Printed on ${printer.name}`);
    job = null;
  }
  if (!job) {
    if (!ACTIVE.has(reading.state)) return saveJob(printer, null);
    job = { key: reading.jobKey ?? "", file: reading.filename, counter: 0, amounts: [], bases: [], entries: [] };
  }
  if (prusa && job.filaments === undefined) {
    const filaments = jobFilaments(printer, reading);
    if (filaments !== undefined) job = { ...job, filaments };
  }

  const tools = Math.max(1, printer.tools, ...job.entries.map((e) => e.tool + 1));
  const before = Array.from({ length: tools }, (_, t) => job.amounts[t] ?? 0);
  const amounts = [...before];
  const bases = Array.from({ length: tools }, (_, t) => job.bases[t] ?? 0);
  // A PrusaLink job that finished has used all of its filament.
  const counter = Math.max(job.counter, prusa && reading.state === "complete" ? 1 : reading.counter);
  if (prusa) amounts.fill(counter);
  else {
    const tool = reading.tool != null && reading.tool < printer.tools ? reading.tool : 0;
    amounts[tool] += counter - job.counter;
  }

  const ended = ENDED[reading.state];
  // PrusaLink usage isn't known until the print file has been read, so a finished job waits for it.
  const waiting = prusa && job.filaments === undefined;
  const spoolByTool = new Map(loaded.filter((l) => l.tool < printer.tools).map((l) => [l.tool, l.spoolId]));
  const spoolRows = new Map((await getSpoolRows([...spoolByTool.values()])).map((s) => [s.id, s]));
  const entries: PrinterJob["entries"] = [];

  for (let t = 0; t < tools; t++) {
    const spoolId = spoolByTool.get(t);
    let entry = job.entries.find((e) => e.tool === t);
    let row = entry
      ? await db.query.usageLogs.findFirst({ where: eq(usageLogs.id, entry.usageId), columns: { id: true, spoolId: true, grams: true } })
      : undefined;
    if (entry && (!row || entry.spoolId !== spoolId || row.spoolId !== spoolId)) {
      // Spool swapped or unloaded mid-print (or the entry was deleted): the next spool starts here.
      if (row) await setNote(row.id, `Printed on ${printer.name}`);
      bases[t] = before[t];
      entry = undefined;
      row = undefined;
    }

    const spool = spoolId ? spoolRows.get(spoolId) : undefined;
    const share = amounts[t] - bases[t];
    let grams: number | null = null;
    if (spool && !prusa) grams = round2(gramsForLength(share, spool.diameter, spool.density ?? undefined));
    if (spool && prusa && job.filaments) {
      // Slots beyond the printer's tools (an MMU print on a printer set up with one) go to tool 0.
      const total = job.filaments
        .filter((f) => (f.index < printer.tools ? f.index : 0) === t)
        .reduce((sum, f) => sum + (gramsFor({ ...f, type: null, colorHex: null, profile: null }, spool) ?? 0), 0);
      grams = round2(total * share);
    }

    if (spool && grams != null) {
      const note = `${ended ?? "Printing"} on ${printer.name}`;
      if (row && entry) {
        if (row.grams !== grams || ended) {
          await db.update(usageLogs).set({ grams, note }).where(eq(usageLogs.id, row.id));
          await syncStatus(spool.id);
        }
      } else if (grams > 0) {
        const [inserted] = await db
          .insert(usageLogs)
          .values({ spoolId: spool.id, grams, kind: "print", printName: printNameFromFile(job.file || reading.filename), note })
          .returning({ id: usageLogs.id });
        entry = { tool: t, spoolId: spool.id, usageId: inserted.id };
        await syncStatus(spool.id);
      }
    }
    if (entry) entries.push(entry);
  }

  await saveJob(printer, ended && !waiting ? null : { ...job, counter, amounts, bases, entries });
}

async function saveJob(printer: Printer, job: PrinterJob | null) {
  if (JSON.stringify(printer.job) === JSON.stringify(job)) return;
  await db.update(printers).set({ job }).where(eq(printers.id, printer.id));
}

/** Starts the background loop once per server process. */
export function startPrinterSync() {
  if (state.started) return;
  state.started = true;
  const tick = async () => {
    try {
      const rows = await db.select({ id: printers.id }).from(printers);
      const ids = new Set(rows.map((r) => r.id));
      for (const id of state.live.keys()) if (!ids.has(id)) forgetLiveStatus(id);
      // A printer that's slow to answer shouldn't hold up the others.
      for (const r of rows) {
        if (!state.inflight.has(r.id)) pollPrinter(r.id).catch((e) => console.error(`[printers] printer ${r.id}:`, e));
      }
    } catch (e) {
      console.error("[printers]", e);
    }
    setTimeout(tick, POLL_MS);
  };
  void tick();
}
