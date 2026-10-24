import { and, asc, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, filaments, materials, printers, spools, usageLogs } from "@/db/schema";

const RECENT_PRINTS = 15;
// Enough entries for the recent prints even when each one used several tools or spools.
const RECENT_ENTRIES = 200;

export type PrintStatus = "printing" | "printed" | "cancelled" | "failed";

export type PrinterPrint = {
  key: string;
  name: string;
  startedAt: Date;
  status: PrintStatus;
  grams: number;
  cost: number | null;
  spools: { id: number; code: string; colorHex: string | null; colorName: string | null; filamentName: string; grams: number }[];
};

/** The printer's note on an entry, e.g. "Cancelled on Voron", says how the print went. */
function statusFromNote(note: string | null): PrintStatus {
  const word = note?.split(" ")[0];
  if (word === "Printing") return "printing";
  if (word === "Cancelled") return "cancelled";
  if (word === "Failed") return "failed";
  return "printed";
}

const STATUS_ORDER: PrintStatus[] = ["printing", "failed", "cancelled", "printed"];

/** A day as yyyy-mm-dd in the server's time zone, the one dates are shown in. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Recent prints, totals and filament usage for one printer's detail page. */
export async function getPrinterHistory(printerId: number, currency: string) {
  // Midnight 29 days ago, so the chart's 30 days end with today. setDate keeps it right across DST changes.
  const dayAt = (offset: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };
  const since = dayAt(-29);
  const where = and(eq(usageLogs.printerId, printerId), eq(usageLogs.kind, "print"));
  // gte() rather than a raw date in sql``, which postgres.js can't send without the column's type.
  const inLast30 = gte(usageLogs.createdAt, since);
  // Entries without a print id (logged before it existed) are a print each.
  const printKey = sql`coalesce(${usageLogs.printJob}, ${usageLogs.id}::text)`;
  // Only prices in the main currency add up; other currencies are left out of the cost.
  const cost = sql`case when ${spools.price} is not null and coalesce(${spools.currency}, ${currency}) = ${currency}
    then ${usageLogs.grams} * ${spools.price} / nullif(${spools.initialWeight}, 0) end`;

  const [[totals], entries, byFilament, daily] = await Promise.all([
    db
      .select({
        prints: sql<number>`count(distinct ${printKey})`.mapWith(Number),
        grams: sql<number>`coalesce(sum(${usageLogs.grams}), 0)`.mapWith(Number),
        prints30: sql<number>`count(distinct case when ${inLast30} then ${printKey} end)`.mapWith(Number),
        grams30: sql<number>`coalesce(sum(case when ${inLast30} then ${usageLogs.grams} end), 0)`.mapWith(Number),
        cost: sql<number | null>`sum(${cost})`.mapWith(Number),
        firstAt: sql<Date | null>`min(${usageLogs.createdAt})`.mapWith(usageLogs.createdAt),
      })
      .from(usageLogs)
      .innerJoin(spools, eq(spools.id, usageLogs.spoolId))
      .where(where),
    db
      .select({
        key: sql<string>`${printKey}`,
        grams: usageLogs.grams,
        printName: usageLogs.printName,
        note: usageLogs.note,
        createdAt: usageLogs.createdAt,
        cost: sql<number | null>`${cost}`.mapWith(Number),
        spoolId: spools.id,
        code: spools.code,
        colorHex: filaments.colorHex,
        colorName: filaments.colorName,
        filamentName: filaments.name,
      })
      .from(usageLogs)
      .innerJoin(spools, eq(spools.id, usageLogs.spoolId))
      .innerJoin(filaments, eq(filaments.id, spools.filamentId))
      .where(where)
      .orderBy(desc(usageLogs.createdAt), desc(usageLogs.id))
      .limit(RECENT_ENTRIES),
    db
      .select({
        filamentId: filaments.id,
        filamentName: filaments.name,
        colorName: filaments.colorName,
        colorHex: filaments.colorHex,
        brandName: brands.name,
        materialName: materials.name,
        grams: sql<number>`sum(${usageLogs.grams})`.mapWith(Number),
        prints: sql<number>`count(distinct ${printKey})`.mapWith(Number),
      })
      .from(usageLogs)
      .innerJoin(spools, eq(spools.id, usageLogs.spoolId))
      .innerJoin(filaments, eq(filaments.id, spools.filamentId))
      .leftJoin(brands, eq(brands.id, filaments.brandId))
      .leftJoin(materials, eq(materials.id, filaments.materialId))
      .where(where)
      .groupBy(filaments.id, brands.name, materials.name)
      .orderBy(desc(sql`sum(${usageLogs.grams})`))
      .limit(8),
    db
      .select({ createdAt: usageLogs.createdAt, grams: usageLogs.grams })
      .from(usageLogs)
      .where(and(where, inLast30)),
  ]);

  // Entries come newest first, so prints keep that order. A print is dated by its first entry.
  const prints = new Map<string, PrinterPrint & { statuses: Set<PrintStatus> }>();
  for (const e of entries) {
    let p = prints.get(e.key);
    if (!p) {
      if (prints.size === RECENT_PRINTS) continue;
      p = { key: e.key, name: e.printName || "Print", startedAt: e.createdAt, status: "printed", grams: 0, cost: null, spools: [], statuses: new Set() };
      prints.set(e.key, p);
    }
    if (e.createdAt < p.startedAt) p.startedAt = e.createdAt;
    p.grams += e.grams;
    if (e.cost != null) p.cost = (p.cost ?? 0) + e.cost;
    p.statuses.add(statusFromNote(e.note));
    const spool = p.spools.find((s) => s.id === e.spoolId);
    if (spool) spool.grams += e.grams;
    else p.spools.push({ id: e.spoolId, code: e.code, colorHex: e.colorHex, colorName: e.colorName, filamentName: e.filamentName, grams: e.grams });
  }
  const recent: PrinterPrint[] = [...prints.values()].map(({ statuses, ...p }) => ({
    ...p,
    // A spool swapped out mid-print reads "Printed" while the print goes on, so the liveliest status wins.
    status: STATUS_ORDER.find((s) => statuses.has(s)) ?? "printed",
    spools: p.spools.reverse(),
  }));

  const perDay = new Map<string, number>();
  for (const e of daily) perDay.set(dayKey(e.createdAt), (perDay.get(dayKey(e.createdAt)) ?? 0) + e.grams);
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = dayAt(i - 29);
    return { date, grams: Math.max(0, perDay.get(dayKey(date)) ?? 0) };
  });

  return {
    prints: totals?.prints ?? 0,
    grams: totals?.grams ?? 0,
    prints30: totals?.prints30 ?? 0,
    grams30: totals?.grams30 ?? 0,
    cost: totals?.cost ?? null,
    firstAt: totals?.firstAt ?? null,
    recent,
    byFilament,
    days,
  };
}

export type PrinterHistory = Awaited<ReturnType<typeof getPrinterHistory>>;

/** Printer makers offered in the printer form, besides the ones already used. */
const COMMON_BRANDS = ["Anycubic", "Bambu Lab", "Creality", "Elegoo", "Prusa", "Qidi", "RatRig", "Snapmaker", "Sovol", "Voron"];

/** Brands and locations to suggest in the printer form. Locations include where spools are kept. */
export async function getPrinterSuggestions() {
  const [brandRows, locationRows] = await Promise.all([
    db.selectDistinct({ name: printers.brand }).from(printers).where(and(isNotNull(printers.brand), ne(printers.brand, ""))),
    db
      .select({ name: sql<string>`l.name` })
      .from(
        sql`(select ${printers.location} as name from ${printers} union select ${spools.location} from ${spools}) as l`,
      )
      .where(sql`l.name is not null and l.name <> ''`)
      .orderBy(asc(sql`l.name`)),
  ]);
  const brandNames = [...new Set([...COMMON_BRANDS, ...brandRows.map((r) => r.name!)])].sort((a, b) => a.localeCompare(b));
  return { brands: brandNames, locations: locationRows.map((r) => r.name) };
}

export type PrinterSuggestions = Awaited<ReturnType<typeof getPrinterSuggestions>>;
