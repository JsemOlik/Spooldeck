import { listFilamentOptions } from "@/db/queries/filaments";
import { withApi } from "@/lib/auth/api";

export const GET = withApi(async () => Response.json({ filaments: await listFilamentOptions() }));
