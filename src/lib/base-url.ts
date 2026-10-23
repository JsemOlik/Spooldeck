import "server-only";
import { headers } from "next/headers";
import { getAppSettings } from "./settings";

/** Base URL encoded into label QR codes: Settings → PUBLIC_URL env → request host. */
export async function getBaseUrl() {
  const { publicUrl } = await getAppSettings();
  if (publicUrl) return publicUrl.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
