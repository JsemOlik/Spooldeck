import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";
import { filaments, materials, printers, spools, usageLogs, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { normalizePrinterUrl } from "@/lib/printers/http";
import { gramsForLength } from "@/lib/weights";
import { getLiveStatus, pollPrinter, printFileRead } from "@/server/printer-sync";
import { getPrinterHistory } from "@/db/queries/printers";
import { createPrinter, deletePrinter, listPrinters, loadSpool, updatePrinter } from "@/server/services/printers";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as listPrintersApi, POST as createPrinterApi } from "@/app/api/v1/printers/route";
import { PUT as updatePrinterApi } from "@/app/api/v1/printers/[id]/route";
import { POST as loadSpoolApi } from "@/app/api/v1/printers/[id]/spool/route";
import { bgcode } from "./fixtures/bgcode";

/** A stand-in for Moonraker's /printer/objects/query that tests drive by editing `printer`. */
const printer = { state: "standby", filename: "", filament_used: 0, progress: 0, extruder: "extruder", apiKey: "secret" as string | null };
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
          toolhead: { extruder: printer.extruder },
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
  return (await db.query.printers.findFirst({ where: eq(printers.id, printerId) }))!.job;
}

function print(filename: string, mm: number, state = "printing") {
  Object.assign(printer, { filename, filament_used: mm, state });
}

let filamentId: number;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
  const [pla] = await db.insert(materials).values({ name: "PLA-test", density: 1.24 }).returning();
  const [f] = await db.insert(filaments).values({ name: "Galaxy Black", materialId: pla.id, diameter: 1.75 }).returning();
  filamentId = f.id;
});

async function newSpools(...codes: string[]) {
  const rows = await db
    .insert(spools)
    .values(codes.map((code) => ({ filamentId, code, initialWeight: 1000 })))
    .returning();
  return rows.map((r) => r.id);
}

describe("Moonraker printers", () => {
  let printerId: number;
  let spoolA: number;
  let spoolB: number;

  beforeAll(async () => {
    [spoolA, spoolB] = await newSpools("PRNA", "PRNB");
  });

  test("normalizes pasted addresses", () => {
    expect(normalizePrinterUrl("voron.local:7125")).toBe("http://voron.local:7125");
    expect(normalizePrinterUrl(" http://voron.local/#/ ")).toBe("http://voron.local");
    expect(normalizePrinterUrl("https://printer.example.com/moonraker/")).toBe("https://printer.example.com/moonraker");
  });

  test("converts extruded length to grams", () => {
    // 1 m of 1.75 mm PLA is about 3 g.
    expect(gramsForLength(1000, 1.75, 1.24)).toBeCloseTo(2.98, 2);
    expect(gramsForLength(0)).toBe(0);
  });

  test("adds a printer and reports a missing or wrong API key", async () => {
    const noKey = await createPrinter({ name: "Voron", url: MOONRAKER });
    expect(noKey).toMatchObject({ ok: true, online: false });
    expect(noKey.message).toContain("needs a password or API key");
    printerId = noKey.id!;

    const wrong = await updatePrinter(printerId, { name: "Voron", url: MOONRAKER, apiKey: "nope" });
    expect(wrong.message).toContain("rejected the password or API key");

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

  test("keeps the brand, model, motion system and location, and clears them when emptied", async () => {
    const details = { brand: "Voron", model: "2.4 R2", motion: "corexy", location: "Garage" };
    await updatePrinter(printerId, { name: "Voron", url: MOONRAKER, apiKey: "secret", ...details });
    expect((await listPrinters()).find((p) => p.id === printerId)).toMatchObject(details);
    expect((await updatePrinter(printerId, { name: "Voron", url: MOONRAKER, motion: "delta" })).fieldErrors?.motion).toBeDefined();
    await updatePrinter(printerId, { name: "Voron", url: MOONRAKER });
    expect((await listPrinters()).find((p) => p.id === printerId)).toMatchObject({ brand: null, model: null, motion: null, location: null });
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
    expect(view).toMatchObject({
      kind: "moonraker",
      hasApiKey: true,
      slots: [{ tool: 0, spool: { id: spoolA }, grams: g(2000) }],
      job: { printName: "benchy", grams: g(2000), usage: "counting" },
    });
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
    expect(await job(printerId)).toBeNull();
  });

  test("a print that starts before a spool is loaded counts from its start", async () => {
    await loadSpool(printerId, null);
    print("clip.gcode", 400);
    await pollPrinter(printerId);
    expect((await job(printerId))?.file).toBe("clip.gcode");

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
    expect(views.find((p) => p.id === printerId)?.slots[0].spool).toBeNull();
    expect(views.find((p) => p.id === other.id)?.slots[0].spool?.id).toBe(spoolA);
    expect(await deletePrinter(other.id!)).toMatchObject({ ok: true });
    expect(await loadSpool(printerId, 999_999)).toMatchObject({ error: "Spool not found" });
  });

  test("a toolchanger counts each extruder against its own spool", async () => {
    const [t0, t1] = await newSpools("TC0", "TC1");
    const tc = await createPrinter({ name: "Stealthchanger", url: MOONRAKER, apiKey: "secret", tools: "2" });
    expect(await loadSpool(tc.id!, t0, 0)).toMatchObject({ ok: true, message: "Loaded on Stealthchanger · tool 1" });
    expect(await loadSpool(tc.id!, t1, 1)).toMatchObject({ ok: true });
    expect(await loadSpool(tc.id!, t1, 2)).toMatchObject({ fieldErrors: { tool: ["Pick a tool from 1 to 2"] } });

    printer.extruder = "extruder";
    print("two_colour.gcode", 1000);
    await pollPrinter(tc.id!);
    printer.extruder = "extruder1";
    print("two_colour.gcode", 1500);
    await pollPrinter(tc.id!);
    printer.extruder = "extruder";
    print("two_colour.gcode", 1800, "complete");
    await pollPrinter(tc.id!);

    expect((await entries(t0)).map((e) => [e.grams, e.note])).toEqual([[g(1300), "Printed on Stealthchanger"]]);
    expect((await entries(t1)).map((e) => [e.grams, e.note])).toEqual([[g(500), "Printed on Stealthchanger"]]);

    // Both tools' entries are one print on the printer's page.
    const [e0, e1] = [(await entries(t0))[0], (await entries(t1))[0]];
    expect(e0.printerId).toBe(tc.id!);
    expect(e0.printJob).toBeTruthy();
    expect(e1.printJob).toBe(e0.printJob);
    const history = await getPrinterHistory(tc.id!, "EUR");
    expect(history).toMatchObject({ prints: 1, prints30: 1 });
    expect(history.grams).toBeCloseTo(g(1300) + g(500), 5);
    expect(history.recent).toHaveLength(1);
    expect(history.recent[0]).toMatchObject({ name: "two colour", status: "printed" });
    expect(history.recent[0].spools.map((s) => [s.id, s.grams])).toEqual([
      [t0, g(1300)],
      [t1, g(500)],
    ]);
    expect(history.days.at(-1)!.grams).toBeCloseTo(g(1800), 5);

    // Moving a spool to another tool takes it off the first one.
    await loadSpool(tc.id!, t0, 1);
    const view = (await listPrinters()).find((p) => p.id === tc.id)!;
    expect(view.slots.map((s) => s.spool?.id ?? null)).toEqual([null, t0]);
    // Fewer tools: spools on the ones that went come off.
    await updatePrinter(tc.id!, { name: "Stealthchanger", url: MOONRAKER, tools: "1" });
    expect((await listPrinters()).find((p) => p.id === tc.id)!.slots).toEqual([{ tool: 0, spool: null, grams: null }]);
    await deletePrinter(tc.id!);
    // The usage stays on the spools without the printer.
    expect((await entries(t0)).map((e) => [e.grams, e.printerId])).toEqual([[g(1300), null]]);
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
      const prusa = (JSON.parse(text) as { id: number }[]).find((p) => p.id === id);
      expect(prusa).toMatchObject({ hasApiKey: false, slots: [{ spool: { id: spoolB } }] });

      const badTool = await loadSpoolApi(call(`/printers/${id}/spool`, { spoolId: spoolB, tool: 3 }), params(id));
      expect(badTool.status).toBe(400);
    });
  });
});

/** A stand-in for PrusaLink: /api/v1/job, file downloads under /usb, and Digest or X-Api-Key sign-in. */
const prusa = {
  job: null as null | Record<string, unknown>,
  files: new Map<string, Blob>(),
  downloads: 0,
};
const PASSWORD = "pl-pass";
const NONCE = "8e1d4a";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function signedIn(req: Request) {
  if (req.headers.get("x-api-key") === PASSWORD) return true;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Digest ")) return false;
  const p = Object.fromEntries([...header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map((m) => [m[1], m[2] ?? m[3]]));
  // Buddy firmware's challenge has no qop, so the response is the plain RFC 2069 kind.
  const ha1 = md5(`maker:Printer API:${PASSWORD}`);
  return p.username === "maker" && p.nonce === NONCE && p.response === md5(`${ha1}:${NONCE}:${md5(`GET:${p.uri}`)}`);
}

const prusaLink = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (!signedIn(req)) {
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": `Digest realm="Printer API", nonce="${NONCE}", stale=false` } });
    }
    if (url.pathname === "/api/v1/job") return prusa.job ? Response.json(prusa.job) : new Response(null, { status: 204 });
    const file = prusa.files.get(decodeURIComponent(url.pathname));
    if (file) {
      prusa.downloads++;
      return new Response(file);
    }
    return new Response("Not Found", { status: 404 });
  },
});
afterAll(() => prusaLink.stop(true));
const PRUSALINK = `http://127.0.0.1:${prusaLink.port}`;

function prusaJob(id: number, state: string, progress: number, file: { name: string; download?: string; meta?: Record<string, unknown> }) {
  prusa.job = {
    id,
    state,
    progress,
    time_remaining: 600,
    time_printing: 60,
    file: { name: file.name.slice(0, 8), display_name: file.name, path: "/usb", refs: file.download ? { download: file.download } : {}, meta: file.meta },
  };
}

/** Polls, waits for a print file read the poll started, and polls again. */
async function pollPrusa(id: number) {
  await pollPrinter(id);
  await printFileRead(id);
  await pollPrinter(id);
}

describe("PrusaLink printers", () => {
  let xl: number;
  let left: number;
  let right: number;

  beforeAll(async () => {
    [left, right] = await newSpools("XL1", "XL2");
    // A two-head XL print: 10 g from tool 1, 4 g from tool 2 (an MMU3 print looks the same).
    prusa.files.set(
      "/usb/CUBE~1.BGC",
      bgcode([
        { type: 0, text: "Producer=PrusaSlicer 2.9.2\n" },
        { type: 4, text: "filament used [g]=10.00, 4.00\nfilament used [mm]=3350, 1340\n", deflate: true },
        { type: 1, size: 200_000 },
      ]),
    );
  });

  test("signs in with Digest, and says when the password is wrong", async () => {
    const wrong = await createPrinter({ name: "XL", kind: "prusalink", url: PRUSALINK, username: "maker", apiKey: "nope", tools: "2" });
    expect(wrong).toMatchObject({ ok: true, online: false });
    expect(wrong.message).toContain("rejected the password");
    xl = wrong.id!;
    const right = await updatePrinter(xl, { name: "XL", kind: "prusalink", url: PRUSALINK, username: "maker", apiKey: PASSWORD, tools: "2" });
    expect(right).toMatchObject({ online: true });
    expect(getLiveStatus(xl)).toMatchObject({ online: true, status: { state: "standby" } });
  });

  test("an X-Api-Key works too", async () => {
    const mini = await createPrinter({ name: "MINI", kind: "prusalink", url: PRUSALINK, apiKey: PASSWORD });
    expect(mini).toMatchObject({ online: true });
    const [view] = (await listPrinters()).filter((p) => p.id === mini.id);
    expect(view).toMatchObject({ kind: "prusalink", username: null, tools: 1 });
    await deletePrinter(mini.id!);
  });

  test("splits a print between the tools by the file's usage and the progress", async () => {
    await loadSpool(xl, left, 0);
    await loadSpool(xl, right, 1);
    prusaJob(7, "PRINTING", 25, { name: "Cube_0.4n_0.2mm_PLA_XL_1h.bgcode", download: "/usb/CUBE~1.BGC" });
    await pollPrusa(xl);
    expect((await entries(left)).map((e) => [e.printName, e.grams, e.note])).toEqual([["Cube", 2.5, "Printing on XL"]]);
    expect((await entries(right)).map((e) => e.grams)).toEqual([1]);

    prusaJob(7, "PRINTING", 50, { name: "Cube_0.4n_0.2mm_PLA_XL_1h.bgcode", download: "/usb/CUBE~1.BGC" });
    await pollPrusa(xl);
    const view = (await listPrinters()).find((p) => p.id === xl)!;
    expect(view.job).toEqual({ printName: "Cube", grams: 7, usage: "counting" });
    expect(view.slots.map((s) => s.grams)).toEqual([5, 2]);
    // The file is read once per job.
    expect(prusa.downloads).toBe(1);
  });

  test("a stopped print keeps what it used up to then", async () => {
    prusaJob(7, "STOPPED", 60, { name: "Cube_0.4n_0.2mm_PLA_XL_1h.bgcode", download: "/usb/CUBE~1.BGC" });
    await pollPrusa(xl);
    expect((await entries(left)).map((e) => [e.grams, e.note])).toEqual([[6, "Cancelled on XL"]]);
    expect((await entries(right)).map((e) => [e.grams, e.note])).toEqual([[2.4, "Cancelled on XL"]]);
    expect(await job(xl)).toBeNull();
  });

  test("a finished print counts in full", async () => {
    prusaJob(8, "PRINTING", 10, { name: "Cube_0.4n_0.2mm_PLA_XL_1h.bgcode", download: "/usb/CUBE~1.BGC" });
    await pollPrusa(xl);
    prusaJob(8, "FINISHED", 99, { name: "Cube_0.4n_0.2mm_PLA_XL_1h.bgcode", download: "/usb/CUBE~1.BGC" });
    await pollPrusa(xl);
    expect((await entries(left)).at(-1)).toMatchObject({ grams: 10, note: "Printed on XL" });
    expect((await entries(right)).at(-1)).toMatchObject({ grams: 4, note: "Printed on XL" });
    prusa.job = null;
    await pollPrusa(xl);
    expect(getLiveStatus(xl)).toMatchObject({ status: { state: "standby" } });
  });

  test("uses the stats Prusa-Link lists with the job, without downloading", async () => {
    const mk3 = await createPrinter({ name: "MK3S", kind: "prusalink", url: PRUSALINK, username: "maker", apiKey: PASSWORD });
    const [spool] = await newSpools("MK3");
    await loadSpool(mk3.id!, spool);
    const downloads = prusa.downloads;
    // Two MMU slots on a printer set up with one tool: it all comes off the one spool.
    prusaJob(9, "PRINTING", 50, { name: "Hook.gcode", meta: { "filament used [g]": "3.00, 1.00", "filament used [mm]": "1000, 330" } });
    await pollPrusa(mk3.id!);
    expect((await entries(spool)).map((e) => [e.printName, e.grams])).toEqual([["Hook", 2]]);
    expect(prusa.downloads).toBe(downloads);
    prusa.job = null;
    await pollPrusa(mk3.id!);
    await deletePrinter(mk3.id!);
  });

  test("a file without usage stats can't be counted, and says so", async () => {
    prusa.files.set("/usb/CURA.GCO", new Blob([";Generated with Cura\nG28\n;Filament used: 1.2m\n"]));
    prusaJob(10, "PRINTING", 30, { name: "cura.gcode", download: "/usb/CURA.GCO" });
    await pollPrusa(xl);
    const view = (await listPrinters()).find((p) => p.id === xl)!;
    expect(view.job).toMatchObject({ printName: "cura", usage: "missing" });
    prusa.job = null;
    await pollPrusa(xl);
    expect(await job(xl)).toBeNull();
  });

  test("an unreachable file is tried again later, and the print waits for it", async () => {
    prusaJob(11, "PRINTING", 40, { name: "Gone.bgcode", download: "/usb/GONE.BGC" });
    await pollPrusa(xl);
    expect((await listPrinters()).find((p) => p.id === xl)!.job).toMatchObject({ usage: "reading" });
    prusaJob(11, "FINISHED", 100, { name: "Gone.bgcode", download: "/usb/GONE.BGC" });
    await pollPrusa(xl);
    // Still held: the usage isn't known yet.
    expect((await job(xl))?.key).toBe("11");
    prusa.job = null;
    await pollPrusa(xl);
    expect(await job(xl)).toBeNull();
  });
});

