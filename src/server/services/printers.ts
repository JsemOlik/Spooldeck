import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { getSpoolRows } from "@/db/queries/spools";
import { type Printer, type PrinterKind, printerSpools, printers, spools, usageLogs } from "@/db/schema";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { printNameFromFile } from "@/lib/slicer/parse";
import { printerSchema } from "@/lib/validation";
import { forgetLiveStatus, getLiveStatus, pollPrinter } from "@/server/printer-sync";
import type { Input } from "@/server/services/spools";

/**
 * Printer management (Klipper through Moonraker, Prusa through PrusaLink) shared by the Server
 * Actions (src/actions/printers.ts) and the JSON API. The polling itself lives in
 * src/server/printer-sync.ts.
 */

export type LoadedSpool = {
  id: number;
  code: string;
  filamentName: string;
  colorName: string | null;
  colorHex: string | null;
  brandName: string | null;
  materialName: string | null;
  remaining: number;
};

export type PrinterView = {
  id: number;
  name: string;
  kind: PrinterKind;
  url: string;
  username: string | null;
  hasApiKey: boolean;
  /** Toolheads or MMU slots. */
  tools: number;
  /** One per tool: the spool on it and, during a print, the grams it has used so far. */
  slots: { tool: number; spool: LoadedSpool | null; grams: number | null }[];
  /** Null until the printer has been polled once. */
  live: {
    online: boolean;
    state: string | null;
    filename: string | null;
    progress: number | null;
    /** The tool extruding now, when the printer says (Klipper toolchangers). */
    tool: number | null;
    message: string | null;
    error: string | null;
    checkedAt: Date;
  } | null;
  /**
   * The print being tracked and the grams taken off its spools so far. `usage` is "reading"
   * while a PrusaLink print file is still being read, and "missing" when it had no usage stats.
   */
  job: { printName: string; grams: number; usage: "counting" | "reading" | "missing" } | null;
};

const ACTIVE_STATES = new Set(["printing", "paused"]);

export function isPrinting(p: PrinterView) {
  return !!p.live?.online && ACTIVE_STATES.has(p.live.state ?? "");
}

/** The spools on a printer, tool 0 first. */
export const loadedSpools = (p: PrinterView) => p.slots.flatMap((s) => (s.spool ? [s.spool] : []));

/** "Voron", or "XL · tool 2" on a printer with several tools. */
export function toolLabel(p: Pick<PrinterView, "name" | "tools">, tool: number) {
  return p.tools > 1 ? `${p.name} · tool ${tool + 1}` : p.name;
}

/** Where each spool on the other printers is loaded, by spool id: "Voron", or "XL · T2" on one with several tools. */
export function loadedElsewhere(printers: PrinterView[], printerId: number) {
  const where: Record<number, string> = {};
  for (const p of printers) {
    if (p.id === printerId) continue;
    for (const s of p.slots) if (s.spool) where[s.spool.id] = p.tools > 1 ? `${p.name} · T${s.tool + 1}` : p.name;
  }
  return where;
}

export async function listPrinters(): Promise<PrinterView[]> {
  const rows = await db.query.printers.findMany({ with: { spools: true }, orderBy: [asc(printers.name), asc(printers.id)] });
  const spoolIds = rows.flatMap((p) => p.spools.map((s) => s.spoolId));
  const usageIds = rows.flatMap((p) => p.job?.entries.map((e) => e.usageId) ?? []);
  const [spoolRows, entries] = await Promise.all([
    getSpoolRows(spoolIds),
    usageIds.length
      ? db.select({ id: usageLogs.id, grams: usageLogs.grams }).from(usageLogs).where(inArray(usageLogs.id, usageIds))
      : [],
  ]);
  const spoolById = new Map(spoolRows.map((s) => [s.id, s]));
  const gramsById = new Map(entries.map((e) => [e.id, e.grams]));

  return rows.map((p) => {
    const live = getLiveStatus(p.id);
    const slots = Array.from({ length: p.tools }, (_, tool) => {
      const s = spoolById.get(p.spools.find((l) => l.tool === tool)?.spoolId ?? 0);
      const entry = p.job?.entries.find((e) => e.tool === tool);
      return {
        tool,
        spool: s
          ? {
              id: s.id,
              code: s.code,
              filamentName: s.filamentName,
              colorName: s.colorName,
              colorHex: s.colorHex,
              brandName: s.brandName,
              materialName: s.materialName,
              remaining: s.remaining,
            }
          : null,
        grams: entry ? (gramsById.get(entry.usageId) ?? null) : null,
      };
    });
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      url: p.url,
      username: p.username,
      hasApiKey: !!p.apiKey,
      tools: p.tools,
      slots,
      live: live && {
        online: live.online,
        state: live.status?.state ?? null,
        filename: live.status?.filename || null,
        progress: live.status?.progress ?? null,
        tool: live.status?.tool ?? null,
        message: live.status?.message || null,
        error: live.error,
        checkedAt: live.checkedAt,
      },
      job: p.job
        ? {
            printName: printNameFromFile(p.job.file),
            grams: Math.round(slots.reduce((sum, s) => sum + (s.grams ?? 0), 0) * 100) / 100,
            usage: p.kind !== "prusalink" || p.job.filaments ? "counting" : p.job.filaments === null ? "missing" : "reading",
          }
        : null,
    };
  });
}

export async function getPrinter(id: number) {
  const views = await listPrinters();
  return views.find((p) => p.id === id) ?? null;
}

/** Polls right away so the caller can say whether the printer answered. */
async function checkConnection(id: number): Promise<Pick<ActionState, "message"> & { online: boolean }> {
  try {
    await pollPrinter(id);
  } catch (e) {
    console.error(`[printers] printer ${id}:`, e);
  }
  const live = getLiveStatus(id);
  return live?.online ? { online: true, message: "Saved and connected" } : { online: false, message: `Saved, but ${lowerFirst(live?.error ?? "the printer didn't answer")}` };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export async function createPrinter(input: Input): Promise<ActionState & { id?: number; online?: boolean }> {
  const parsed = printerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { name, kind, url, username, apiKey, tools } = parsed.data;
  const [row] = await db
    .insert(printers)
    .values({ name, kind, url, username: kind === "prusalink" ? (username ?? null) : null, apiKey: apiKey ?? null, tools: tools ?? 1 })
    .returning({ id: printers.id });
  return { ok: true, id: row.id, ...(await checkConnection(row.id)) };
}

/** Keeps what a tracked print has used so far and stops tracking it. */
async function endJob(printer: Printer) {
  for (const e of printer.job?.entries ?? []) {
    await db.update(usageLogs).set({ note: `Printed on ${printer.name}` }).where(eq(usageLogs.id, e.usageId));
  }
}

export async function updatePrinter(id: number, input: Input): Promise<ActionState & { online?: boolean }> {
  const parsed = printerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { name, kind, url, username, apiKey, clearApiKey, tools = 1 } = parsed.data;
  const current = await db.query.printers.findFirst({ where: eq(printers.id, id) });
  if (!current) return { error: "Printer not found" };
  // Another kind of printer counts jobs differently, so a tracked print ends here.
  const kindChanged = current.kind !== kind;
  if (kindChanged) await endJob(current);
  await db.transaction(async (tx) => {
    await tx
      .update(printers)
      .set({
        name,
        kind,
        url,
        username: kind === "prusalink" ? (username ?? null) : null,
        apiKey: apiKey ?? (clearApiKey === "on" ? null : current.apiKey),
        tools,
        ...(kindChanged ? { job: null } : {}),
      })
      .where(eq(printers.id, id));
    // Spools on tools the printer no longer has come off.
    await tx.delete(printerSpools).where(and(eq(printerSpools.printerId, id), gte(printerSpools.tool, tools)));
  });
  return { ok: true, ...(await checkConnection(id)) };
}

export async function deletePrinter(id: number): Promise<ActionState> {
  const printer = await db.query.printers.findFirst({ where: eq(printers.id, id) });
  if (!printer) return { error: "Printer not found" };
  // A print still running keeps what it used so far.
  await endJob(printer);
  await db.delete(printers).where(eq(printers.id, id));
  forgetLiveStatus(id);
  return { ok: true, message: `Removed ${printer.name}` };
}

/**
 * Puts a spool on a printer's tool (or takes it off with null). A spool can only be in one
 * place, so it comes off any other printer or tool. Mid-print, the old spool keeps what was
 * printed so far and the new one counts from now.
 */
export async function loadSpool(printerId: number, spoolId: number | null, tool = 0): Promise<ActionState> {
  const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId), with: { spools: true } });
  if (!printer) return { error: "Printer not found" };
  if (!Number.isInteger(tool) || tool < 0 || tool >= printer.tools) {
    return { fieldErrors: { tool: [printer.tools > 1 ? `Pick a tool from 1 to ${printer.tools}` : "This printer has one tool"] } };
  }
  if (spoolId) {
    const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId), columns: { id: true } });
    if (!spool) return { error: "Spool not found" };
  }
  const where = toolLabel(printer, tool);
  const current = printer.spools.find((s) => s.tool === tool)?.spoolId ?? null;
  if (current === spoolId) return { ok: true, message: spoolId ? `Already on ${where}` : `Nothing loaded on ${where}` };

  const elsewhere = spoolId ? await db.query.printerSpools.findFirst({ where: eq(printerSpools.spoolId, spoolId) }) : undefined;
  const affected = [...new Set([printerId, ...(elsewhere ? [elsewhere.printerId] : [])])];
  // Count the filament printed up to now against the spools as they were.
  const poll = () => Promise.all(affected.filter((id) => getLiveStatus(id)?.online).map((id) => pollPrinter(id).catch(() => {})));
  await poll();

  await db.transaction(async (tx) => {
    if (spoolId) await tx.delete(printerSpools).where(eq(printerSpools.spoolId, spoolId));
    await tx.delete(printerSpools).where(and(eq(printerSpools.printerId, printerId), eq(printerSpools.tool, tool)));
    if (spoolId) await tx.insert(printerSpools).values({ printerId, tool, spoolId });
  });
  await poll();
  return { ok: true, message: spoolId ? `Loaded on ${where}` : `Unloaded from ${where}` };
}
