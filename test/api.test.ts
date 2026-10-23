import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as logoutEverywhere } from "@/app/api/v1/auth/logout-everywhere/route";
import { POST as createFilament } from "@/app/api/v1/filaments/route";
import { GET as listSpools, POST as createSpool } from "@/app/api/v1/spools/route";
import { GET as getSpool } from "@/app/api/v1/spools/[id]/route";
import { POST as logUsage } from "@/app/api/v1/spools/[id]/usage/route";
import { POST as weighIn } from "@/app/api/v1/spools/[id]/weigh-in/route";
import { POST as resolveScan } from "@/app/api/v1/scan/resolve/route";

const BASE = "http://spooldeck.test/api/v1";
const noParams = { params: Promise.resolve({}) as Promise<never> };
const idParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

function req(path: string, opts: { method?: string; token?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new Request(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe("JSON API (/api/v1)", () => {
  let token: string;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(import.meta.dir, "..", "drizzle") });
    await db.insert(users).values({ username: "maker", passwordHash: await hashPassword("correct horse battery") });
  });

  test("rejects wrong credentials", async () => {
    const res = await login(req("/auth/login", { body: { username: "maker", password: "nope nope nope" } }));
    expect(res.status).toBe(401);
  });

  test("logs in and returns a bearer token", async () => {
    const res = await login(req("/auth/login", { body: { username: "maker", password: "correct horse battery" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ username: "maker" });
    expect(typeof body.token).toBe("string");
    token = body.token;
  });

  test("requires a valid token", async () => {
    expect((await listSpools(req("/spools"), noParams)).status).toBe(401);
    expect((await listSpools(req("/spools", { token: "bogus" }), noParams)).status).toBe(401);
    expect((await listSpools(req("/spools", { token }), noParams)).status).toBe(200);
  });

  test("returns field errors for invalid input", async () => {
    const res = await createFilament(req("/filaments", { token, body: { name: "", colorHex: "nope" } }), noParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.name).toBeDefined();
    expect(body.fieldErrors.colorHex).toBeDefined();
  });

  test("creates a filament and spool, logs usage and weighs in", async () => {
    const f = await createFilament(
      req("/filaments", { token, body: { name: "Galaxy Black", brand: "Prusament", material: "PLA", spoolWeight: 200 } }),
      noParams,
    );
    expect(f.status).toBe(201);
    const { id: filamentId } = await f.json();

    const s = await createSpool(req("/spools", { token, body: { filamentId, initialWeight: 1000, price: 25 } }), noParams);
    expect(s.status).toBe(201);
    const { ids } = await s.json();
    const spoolId = ids[0];

    const used = await logUsage(req(`/spools/${spoolId}/usage`, { token, body: { grams: 120.5, printName: "Benchy" } }), idParams(spoolId));
    expect(used.status).toBe(201);

    let detail = await (await getSpool(req(`/spools/${spoolId}`, { token }), idParams(spoolId))).json();
    expect(detail.status).toBe("opened");
    expect(detail.remaining).toBe(879.5);
    expect(detail.spoolWeight).toBe(200);
    expect(detail.qrUrl).toBe(`http://spooldeck.test/s/${detail.code}`);

    // Scale shows 800 g including the 200 g empty spool → 600 g left, so 279.5 g more was used.
    const w = await weighIn(req(`/spools/${spoolId}/weigh-in`, { token, body: { scaleGrams: 800, includesSpool: true } }), idParams(spoolId));
    expect((await w.json()).message).toBe("Recorded 279.5 g used");
    detail = await (await getSpool(req(`/spools/${spoolId}`, { token }), idParams(spoolId))).json();
    expect(detail.remaining).toBe(600);

    const scan = await (await resolveScan(req("/scan/resolve", { token, body: { text: `https://x.example/s/${detail.code}` } }), noParams)).json();
    expect(scan).toEqual({ kind: "spool", id: spoolId });
  });

  test("missing spools are 404", async () => {
    expect((await getSpool(req("/spools/999999", { token }), idParams(999999))).status).toBe(404);
    expect((await logUsage(req("/spools/999999/usage", { token, body: { grams: 5 } }), idParams(999999))).status).toBe(404);
  });

  test("logging out everywhere revokes the token", async () => {
    expect((await logoutEverywhere(req("/auth/logout-everywhere", { token, method: "POST" }), noParams)).status).toBe(200);
    expect((await listSpools(req("/spools", { token }), noParams)).status).toBe(401);
  });
});
