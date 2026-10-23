import { getDashboard } from "@/db/queries/dashboard";
import { withApi } from "@/lib/auth/api";
import { getAppSettings } from "@/lib/settings";

export const GET = withApi(async () => {
  const settings = await getAppSettings();
  const dashboard = await getDashboard(settings.lowStockGrams, settings.currency);
  return Response.json({ ...dashboard, currency: settings.currency, lowStockGrams: settings.lowStockGrams });
});
