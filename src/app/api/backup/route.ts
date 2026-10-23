import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { BackupError, exportBackup, restoreBackup } from "@/lib/backup";

const MAX_BYTES = 50 * 1024 * 1024;

export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const backup = await exportBackup();
  const date = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="spooldeck-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Restores a backup, replacing all inventory data. A route handler rather than a
 * Server Action so large backups aren't limited by the 1 MB action body cap.
 */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // CSRF: require a same-origin JSON request (cross-site JSON POSTs need a CORS preflight we never grant).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Expected a JSON body" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return Response.json({ error: "That file is too large for a Spooldeck backup." }, { status: 413 });
  }

  let json: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) throw new Error("too large");
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }
  try {
    const counts = await restoreBackup(json);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, counts });
  } catch (e) {
    if (e instanceof BackupError) return Response.json({ error: e.message }, { status: 400 });
    console.error("Backup import failed", e);
    return Response.json({ error: "Import failed; nothing was changed. Check the server logs." }, { status: 500 });
  }
}
