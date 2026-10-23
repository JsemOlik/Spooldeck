import { describe, expect, test } from "bun:test";
import {
  extractSpoolData,
  fetchPrusamentSpool,
  mapPrusamentData,
  parsePrusamentUrl,
  PrusamentError,
} from "@/lib/prusament";

const fixture = await Bun.file(new URL("./fixtures/prusament-spool.html", import.meta.url)).text();
const ref = { goodsId: 19591, spoolId: "599d7dba02" };

describe("parsePrusamentUrl", () => {
  test.each([
    ["https://prusament.com/spool/19591/599d7dba02/", { goodsId: 19591, spoolId: "599d7dba02" }],
    ["https://www.prusament.com/spool/19591/599D7DBA02", { goodsId: 19591, spoolId: "599d7dba02" }],
    ["https://prusament.com/cs/spool/19591/599d7dba02/", { goodsId: 19591, spoolId: "599d7dba02" }],
    ["https://prusament.com/spool/599d7dba02/", { goodsId: null, spoolId: "599d7dba02" }],
    ["  http://prusament.com/spool/19591/599d7dba02/  ", { goodsId: 19591, spoolId: "599d7dba02" }],
  ])("accepts %s", (input, expected) => {
    expect(parsePrusamentUrl(input)).toEqual(expected);
  });

  test.each([
    "https://evil.example/spool/19591/599d7dba02/",
    "https://prusament.com.evil.example/spool/19591/599d7dba02/",
    "https://evilprusament.com/spool/19591/599d7dba02/",
    "https://user@evil.example/?https://prusament.com/spool/1/599d7dba02/",
    "ftp://prusament.com/spool/19591/599d7dba02/",
    "javascript:alert(1)//prusament.com/spool/1/599d7dba02",
    "https://prusament.com/spool/19591/not-hex/",
    "https://prusament.com/admin/",
    "not a url",
    "",
  ])("rejects %s", (input) => {
    expect(parsePrusamentUrl(input)).toBeNull();
  });
});

describe("extractSpoolData", () => {
  test("reads the embedded spoolData from a real page", () => {
    const data = extractSpoolData(fixture);
    expect(data).not.toBeNull();
    expect(data!.filament.name).toBe("Prusament PLA Noctua Brown 1kg");
    expect(data!.weight).toBe(1071);
  });

  test("returns null when the spool isn't found", () => {
    expect(extractSpoolData("<script>var spoolFound = false; var spoolData = '{}';</script>")).toBeNull();
  });

  test("returns null for pages without data or with invalid JSON", () => {
    expect(extractSpoolData("<html></html>")).toBeNull();
    expect(extractSpoolData("<script>var spoolData = '{not json';</script>")).toBeNull();
  });

  test("handles escaped quotes inside the JSON string", () => {
    const html = `<script>var spoolData = '{"weight":1000,"filament":{"name":"Rock\\'n\\'Roll Red"}}';</script>`;
    expect(extractSpoolData(html)?.filament.name).toBe("Rock'n'Roll Red");
  });
});

describe("mapPrusamentData", () => {
  test("maps the fixture to filament and spool fields", () => {
    const mapped = mapPrusamentData(extractSpoolData(fixture)!, ref);
    expect(mapped.filament).toMatchObject({
      brand: "Prusament",
      material: "PLA",
      colorName: "Noctua Brown",
      colorHex: "#75483d",
      nominalWeight: 1000,
      spoolWeight: 278,
      nozzleMin: 205,
      nozzleMax: 225,
      bedMin: 40,
      bedMax: 60,
      prusamentGoodsId: 19591,
    });
    expect(mapped.spool).toMatchObject({
      prusamentSpoolId: "599d7dba02",
      initialWeight: 1071,
      spoolWeight: 278,
      lengthM: 363,
      diameterTolerance: 0.019,
    });
    expect(mapped.spool.manufactureDate?.startsWith("2026-02-01")).toBe(true);
  });
});

describe("fetchPrusamentSpool", () => {
  const ok = (body: string, url = "https://prusament.com/spool/19591/599d7dba02/") =>
    (async () => Object.defineProperty(new Response(body), "url", { value: url })) as unknown as typeof fetch;

  test("only ever requests prusament.com", async () => {
    let requested = "";
    const spy = (async (input: string) => {
      requested = input;
      return Object.defineProperty(new Response(fixture), "url", { value: input });
    }) as unknown as typeof fetch;
    await fetchPrusamentSpool(ref, spy);
    expect(new URL(requested).hostname).toBe("prusament.com");
  });

  test("rejects redirects to other hosts", async () => {
    expect(fetchPrusamentSpool(ref, ok(fixture, "https://evil.example/"))).rejects.toBeInstanceOf(PrusamentError);
  });

  test("reports missing spools and HTTP errors", async () => {
    expect(fetchPrusamentSpool(ref, ok("<script>var spoolFound = false</script>"))).rejects.toThrow("not found");
    const notFound = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect(fetchPrusamentSpool(ref, notFound)).rejects.toThrow("503");
  });
});
