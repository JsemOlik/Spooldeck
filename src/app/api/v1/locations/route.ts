import { listLocationsWithCounts } from "@/db/queries/spools";
import { withApi } from "@/lib/auth/api";

export const GET = withApi(async () => Response.json({ locations: await listLocationsWithCounts() }));
