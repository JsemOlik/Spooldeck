import type { Metadata } from "next";
import { createSpoolAction } from "@/actions/spools";
import { PageHeader } from "@/components/page-header";
import { SpoolForm } from "@/components/spools/spool-form";
import { listVendors } from "@/db/queries/catalog";
import { listFilamentOptions } from "@/db/queries/filaments";
import { listLocations } from "@/db/queries/spools";
import { intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Add spool" };

export default async function NewSpoolPage({ searchParams }: PageProps<"/spools/new">) {
  const sp = await searchParams;
  const [filaments, vendors, locations, settings] = await Promise.all([
    listFilamentOptions(),
    listVendors(),
    listLocations(),
    getAppSettings(),
  ]);
  const filamentId = intParam(sp.filament);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add spool" description="A physical spool of a filament you own. It gets its own QR code." />
      <SpoolForm
        mode="create"
        action={createSpoolAction}
        filaments={filaments}
        vendors={vendors.map((v) => v.name)}
        locations={locations}
        currency={settings.currency}
        defaults={{ filamentId, purchaseDate: today }}
      />
    </div>
  );
}
