import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  try {
    await db.run(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
