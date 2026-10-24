import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { getSpoolRows } from "@/db/queries/spools";
import { printers, spools, usageLogs } from "@/db/schema";
import { type ActionState, fromZodError } from "@/lib/action-state";
import { printNameFromFile } from "@/lib/slicer/parse";
import { printerSchema } from "@/lib/validation";
import { forgetLiveStatus, getLiveStatus, pollPrinter } from "@/server/printer-sync";
import type { Input } from "@/server/services/spools";

/**
 * Printer (Moonraker) management shared by the Server Actions (src/actions/printers.ts) and the
 * JSON API. The polling itself lives in src/server/printer-sync.ts.
 */

export type PrinterView = {
  id: number;
  name: string;
  url: string;
  hasApiKey: boolean;
  spool: {
    id: number;
    code: string;
    filamentName: string;
    colorName: string | null;
    colorHex: string | null;
    brandName: string | null;
    materialName: string | null;
    remaining: number;
  } | null;
  /** Null until the printer has been polled once. */
  live: {
    online: boolean;
    state: string | null;
    filename: string | null;
    progress: number | null;
    message: string | null;
    error: string | null;
    checkedAt: Date;
  } | null;
  /** The print being tracked, with the grams taken off the loaded spool so far. */
  job: { printName: string; usageId: number | null; grams: number } | null;
};

const ACTIVE_STATES = new Set(["printing", "paused"]);

export function isPrinting(p: PrinterView) {
  return !!p.live?.online && ACTIVE_STATES.has(p.live.state ?? "");
}

export async function listPrinters(where?: { spoolId?: number }): Promise<PrinterView[]> {
  const rows = await db
    .select()
    .from(printers)
    .where(where?.spoolId ? eq(printers.spoolId, where.spoolId) : undefined)
    .orderBy(asc(printers.name), asc(printers.id));
  const spoolIds = rows.flatMap((p) => (p.spoolId ? [p.spoolId] : []));
  const usageIds = rows.flatMap((p) => (p.jobUsageId ? [p.jobUsageId] : []));
  const [spoolRows, entries] = await Promise.all([
    getSpoolRows(spoolIds),
    usageIds.length
      ? db.select({ id: usageLogs.id, grams: usageLogs.grams }).from(usageLogs).where(inArray(usageLogs.id, usageIds))
      : [],
  ]);
  const spoolById = new Map(spoolRows.map((s) => [s.id, s]));
  const gramsById = new Map(entries.map((e) => [e.id, e.grams]));

  return rows.map((p) => {
    const s = p.spoolId ? spoolById.get(p.spoolId) : undefined;
    const live = getLiveStatus(p.id);
    return {
      id: p.id,
      name: p.name,
      url: p.url,
      hasApiKey: !!p.apiKey,
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
      live: live && {
        online: live.online,
        state: live.status?.state ?? null,
        filename: live.status?.filename || null,
        progress: live.status?.progress ?? null,
        message: live.status?.message || null,
        error: live.error,
        checkedAt: live.checkedAt,
      },
      job: p.jobFile
        ? { printName: printNameFromFile(p.jobFile), usageId: p.jobUsageId, grams: (p.jobUsageId && gramsById.get(p.jobUsageId)) || 0 }
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
  const [row] = await db
    .insert(printers)
    .values({ name: parsed.data.name, url: parsed.data.url, apiKey: parsed.data.apiKey ?? null })
    .returning({ id: printers.id });
  return { ok: true, id: row.id, ...(await checkConnection(row.id)) };
}

export async function updatePrinter(id: number, input: Input): Promise<ActionState & { online?: boolean }> {
  const parsed = printerSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { name, url, apiKey, clearApiKey } = parsed.data;
  const current = await db.query.printers.findFirst({ where: eq(printers.id, id), columns: { apiKey: true } });
  if (!current) return { error: "Printer not found" };
  await db
    .update(printers)
    .set({ name, url, apiKey: apiKey ?? (clearApiKey === "on" ? null : current.apiKey) })
    .where(eq(printers.id, id));
  return { ok: true, ...(await checkConnection(id)) };
}

export async function deletePrinter(id: number): Promise<ActionState> {
  const printer = await db.query.printers.findFirst({ where: eq(printers.id, id) });
  if (!printer) return { error: "Printer not found" };
  // A print still running keeps what it used so far.
  if (printer.jobUsageId) {
    await db.update(usageLogs).set({ note: `Printed on ${printer.name}` }).where(eq(usageLogs.id, printer.jobUsageId));
  }
  await db.delete(printers).where(eq(printers.id, id));
  forgetLiveStatus(id);
  return { ok: true, message: `Removed ${printer.name}` };
}

/**
 * Puts a spool on a printer (or takes it off with null). A spool can only be on one printer,
 * so it comes off any other. Mid-print, the old spool keeps what was printed so far and the
 * new one counts from now.
 */
export async function loadSpool(printerId: number, spoolId: number | null): Promise<ActionState> {
  const printer = await db.query.printers.findFirst({ where: eq(printers.id, printerId), columns: { id: true, name: true, spoolId: true } });
  if (!printer) return { error: "Printer not found" };
  if (spoolId) {
    const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolId), columns: { id: true } });
    if (!spool) return { error: "Spool not found" };
  }
  if (printer.spoolId === spoolId) return { ok: true, message: spoolId ? `Already on ${printer.name}` : `Nothing loaded on ${printer.name}` };

  const others = spoolId
    ? await db
        .select({ id: printers.id })
        .from(printers)
        .where(and(eq(printers.spoolId, spoolId), ne(printers.id, printerId)))
    : [];
  const affected = [printerId, ...others.map((o) => o.id)];
  // Count the filament printed up to now against the spools as they were.
  await Promise.all(affected.filter((id) => getLiveStatus(id)?.online).map((id) => pollPrinter(id).catch(() => {})));

  await db.transaction(async (tx) => {
    if (others.length) await tx.update(printers).set({ spoolId: null }).where(inArray(printers.id, others.map((o) => o.id)));
    await tx.update(printers).set({ spoolId }).where(eq(printers.id, printerId));
  });
  await Promise.all(affected.filter((id) => getLiveStatus(id)?.online).map((id) => pollPrinter(id).catch(() => {})));
  return { ok: true, message: spoolId ? `Loaded on ${printer.name}` : `Unloaded from ${printer.name}` };
}
