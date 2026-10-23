import { detectedBaseUrl, readInput, respond, withApi } from "@/lib/auth/api";
import { getAppSettings } from "@/lib/settings";
import { saveSettings } from "@/server/services/settings";

export const GET = withApi(async ({ req }) =>
  Response.json({ ...(await getAppSettings()), detectedUrl: detectedBaseUrl(req) }),
);

export const PUT = withApi(async ({ req }) => respond(await saveSettings(await readInput(req))));
