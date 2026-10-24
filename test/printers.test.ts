import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";
import { filaments, materials, printers, spools, usageLogs, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { normalizeMoonrakerUrl } from "@/lib/moonraker";
import { gramsForLength } from "@/lib/weights";
import { getLiveStatus, pollPrinter } from "@/server/printer-sync";
import { createPrinter, deletePrinter, listPrinters, loadSpool, updatePrinter } from "@/server/services/printers";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as listPrintersApi, POST as createPrinterApi } from "@/app/api/v1/printers/route";
import { PUT as updatePrinterApi } from "@/app/api/v1/printers/[id]/route";
import { POST as loadSpoolApi } from "@/app/api/v1/printers/[id]/spool/route";

/** A stand-in for Moonraker's /printer/objects/query that tests drive by editing `printer`. */
const printer = { state: "standby", filename: "", filament_used: 0, progress: 0, apiKey: "secret" as string | null };
const moonraker = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (printer.apiKey && req.headers.get("x-api-key") !== printer.apiKey) {
      return Response.json({ error: { code: 401, message: "Unauthorized" } }, { status: 401 });
    }
    if (url.pathname !== "/printer/objects/query") return Response.json({ error: { message: "Not Found" } }, { status: 404 });
    return Response.json({
      result: {
        eventtime: 1,
        status: {
          print_stats: { state: printer.state, filename: printer.filename, filament_used: printer.filament_used, message: "" },
          display_status: { progress: printer.progress, message: null },
        },
      },
    });
  },
});
afterAll(() => moonraker.stop(true));

const MOONRAKER = `127.0.0.1:${moonraker.port}`;
const g = (mm: number) => Math.round(gramsForLength(mm) * 100) / 100;

async function entries(spoolId: number) {
  return db.select().from(usageLogs).where(eq(usageLogs.spoolId, spoolId)).orderBy(usageLogs.id);
}

async function job(printerId: number) {
  return (await db.query.printers.findFirst({ where: eq(printers.id, printerId) }))!;
}

function print(filename: string, mm: number, state = "printing") {
  Object.assign(printer, { filename, filament_used: mm, state });
}

describe("Moonraker printers", () => {
  let printerId: number;
  let spoolA: number;
  let spoolB: number;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
    const [pla] = await db.insert(materials).values({ name: "PLA-test", density: 1.24 }).returning();
    const [f] = await db.insert(filaments).values({ name: "Galaxy Black", materialId: pla.id, diameter: 1.75 }).returning();
    const rows = await db
      .insert(spools)
      .values([
        { filamentId: f.id, code: "PRNA", initialWeight: 1000 },
        { filamentId: f.id, code: "PRNB", initialWeight: 1000 },
      ])
      .returning();
    [spoolA, spoolB] = rows.map((r) => r.id);
  });

  test("normalizes pasted addresses", () => {
    expect(normalizeMoonrakerUrl("voron.local:7125")).toBe("http://voron.local:7125");
    expect(normalizeMoonrakerUrl(" http://voron.local/#/ ")).toBe("http://voron.local");
    expect(normalizeMoonrakerUrl("https://printer.example.com/moonraker/")).toBe("https://printer.example.com/moonraker");
  });

  test("converts extruded length to grams", () => {
    // 1 m of 1.75 mm PLA is about 3 g.
    expect(gramsForLength(1000, 1.75, 1.24)).toBeCloseTo(2.98, 2);
    expect(gramsForLength(0)).toBe(0);
  });

  test("adds a printer and reports a missing or wrong API key", async () => {
    const noKey = await createPrinter({ name: "Voron", url: MOONRAKER });
    expect(noKey).toMatchObject({ ok: true, online: false });
    expect(noKey.message).toContain("needs an API key");
    printerId = noKey.id!;

    const wrong = await updatePrinter(printerId, { name: "Voron", url: MOONRAKER, apiKey: "nope" });
    expect(wrong.message).toContain("rejected the API key");

    const right = await updatePrinter(printerId, { name: "Voron", url: MOONRAKER, apiKey: "secret" });
    expect(right).toMatchObject({ ok: true, online: true });
    // Leaving the key out keeps the saved one.
    expect(await updatePrinter(printerId, { name: "Voron", url: MOONRAKER })).toMatchObject({ online: true });
    expect(getLiveStatus(printerId)).toMatchObject({ online: true, status: { state: "standby" } });
  });

  test("validates the address", async () => {
    const res = await createPrinter({ name: "Bad", url: "ftp://printer" });
    expect(res.fieldErrors?.url).toBeDefined();
  });

  test("grows one usage entry while a print runs", async () => {
    expect(await loadSpool(printerId, spoolA)).toMatchObject({ ok: true });
    print("benchy_0.4n_0.2mm_PLA_MK4_1h2m.gcode", 1000);
    await pollPrinter(printerId);
    print("benchy_0.4n_0.2mm_PLA_MK4_1h2m.gcode", 2000);
    await pollPrinter(printerId);

    const [entry] = await entries(spoolA);
    expect(entry).toMatchObject({ kind: "print", printName: "benchy", grams: g(2000), note: "Printing on Voron" });
    expect((await entries(spoolA)).length).toBe(1);
    const spool = await db.query.spools.findFirst({ where: eq(spools.id, spoolA) });
    expect(spool?.status).toBe("opened");

    const [view] = await listPrinters();
    expect(view).toMatchObject({ hasApiKey: true, spool: { id: spoolA }, job: { printName: "benchy", grams: g(2000) } });
    expect(view.live).toMatchObject({ online: true, state: "printing" });
    expect(JSON.stringify(view)).not.toContain("secret");
  });

  test("a spool swapped mid-print keeps what it used; the new one counts from there", async () => {
    await loadSpool(printerId, spoolB);
    print("benchy_0.4n_0.2mm_PLA_MK4_1h2m.gcode", 3000, "paused");
    await pollPrinter(printerId);

    expect((await entries(spoolA)).map((e) => [e.grams, e.note])).toEqual([[g(2000), "Printed on Voron"]]);
    expect((await entries(spoolB)).map((e) => e.grams)).toEqual([g(1000)]);
  });

  test("finishing the print closes the entry", async () => {
    print("benchy_0.4n_0.2mm_PLA_MK4_1h2m.gcode", 3500, "complete");
    await pollPrinter(printerId);
    await pollPrinter(printerId);

    expect((await entries(spoolB)).map((e) => [e.grams, e.note])).toEqual([[g(1500), "Printed on Voron"]]);
    expect(await job(printerId)).toMatchObject({ jobFile: null, jobUsageId: null });
  });

  test("a print that starts before a spool is loaded counts from its start", async () => {
    await loadSpool(printerId, null);
    print("clip.gcode", 400);
    await pollPrinter(printerId);
    expect((await job(printerId)).jobFile).toBe("clip.gcode");

    await loadSpool(printerId, spoolA);
    print("clip.gcode", 600, "cancelled");
    await pollPrinter(printerId);
    const last = (await entries(spoolA)).at(-1);
    expect(last).toMatchObject({ printName: "clip", grams: g(600), note: "Cancelled on Voron" });
  });

  test("a new job after a reset starts a new entry", async () => {
    print("clip.gcode", 800);
    await pollPrinter(printerId);
    // Same file again, counter back near zero: the first run ended while we weren't looking.
    print("clip.gcode", 100);
    await pollPrinter(printerId);

    const clips = (await entries(spoolA)).filter((e) => e.printName === "clip");
    expect(clips.map((e) => [e.grams, e.note])).toEqual([
      [g(600), "Cancelled on Voron"],
      [g(800), "Printed on Voron"],
      [g(100), "Printing on Voron"],
    ]);
  });

  test("an unreachable printer keeps its job until it comes back", async () => {
    const before = await job(printerId);
    printer.apiKey = "changed";
    await pollPrinter(printerId);
    expect(getLiveStatus(printerId)).toMatchObject({ online: false });
    expect(await job(printerId)).toEqual(before);

    printer.apiKey = "secret";
    print("clip.gcode", 300, "complete");
    await pollPrinter(printerId);
    expect((await entries(spoolA)).at(-1)).toMatchObject({ grams: g(300), note: "Printed on Voron" });
  });

  test("a spool is only on one printer at a time", async () => {
    const other = await createPrinter({ name: "Ender", url: MOONRAKER, apiKey: "secret" });
    await loadSpool(other.id!, spoolA);
    const views = await listPrinters();
    expect(views.find((p) => p.id === printerId)?.spool).toBeNull();
    expect(views.find((p) => p.id === other.id)?.spool?.id).toBe(spoolA);
    expect(await deletePrinter(other.id!)).toMatchObject({ ok: true });
    expect(await loadSpool(printerId, 999_999)).toMatchObject({ error: "Spool not found" });
  });

  describe("JSON API", () => {
    let token: string;
    const BASE = "http://spooldeck.test/api/v1";
    const call = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
      new Request(`${BASE}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": "10.0.0.9" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
    const none = { params: Promise.resolve({}) as Promise<never> };

    beforeAll(async () => {
      await db.insert(users).values({ username: "printer-api", passwordHash: await hashPassword("correct horse battery") });
      const res = await login(
        new Request(`${BASE}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.9" },
          body: JSON.stringify({ username: "printer-api", password: "correct horse battery" }),
        }),
      );
      token = (await res.json()).token;
    });

    test("adds, lists and loads printers without exposing the API key", async () => {
      const created = await createPrinterApi(call("/printers", { name: "Prusa", url: MOONRAKER, apiKey: "secret" }), none);
      expect(created.status).toBe(201);
      const { id, online } = await created.json();
      expect(online).toBe(true);

      const loaded = await loadSpoolApi(call(`/printers/${id}/spool`, { spoolId: spoolB }), params(id));
      expect(loaded.status).toBe(200);
      expect((await loadSpoolApi(call(`/printers/${id}/spool`, { spoolId: "x" }), params(id))).status).toBe(400);

      const cleared = await updatePrinterApi(call(`/printers/${id}`, { name: "Prusa", url: MOONRAKER, apiKey: null }, "PUT"), params(id));
      expect((await cleared.json()).online).toBe(false);

      const list = await listPrintersApi(call("/printers"), none);
      const text = await list.text();
      expect(text).not.toContain("secret");
      const prusa = (JSON.parse(text) as { id: number; hasApiKey: boolean; spool: { id: number } }[]).find((p) => p.id === id);
      expect(prusa).toMatchObject({ hasApiKey: false, spool: { id: spoolB } });
    });
  });
});
