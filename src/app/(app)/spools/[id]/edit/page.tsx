import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateSpoolAction } from "@/actions/spools";
import { PageHeader } from "@/components/page-header";
import { SpoolForm } from "@/components/spools/spool-form";
import { db } from "@/db";
import { listVendors } from "@/db/queries/catalog";
import { listFilamentOptions } from "@/db/queries/filaments";
import { listLocations } from "@/db/queries/spools";
import { intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Edit spool" };

export default async function EditSpoolPage({ params }: PageProps<"/spools/[id]/edit">) {
  const id = intParam((await params).id);
  if (!id) notFound();
  const [spool, filaments, vendors, locations, settings] = await Promise.all([
    db.query.spools.findFirst({ where: (s, { eq }) => eq(s.id, id), with: { vendor: true } }),
    listFilamentOptions(),
    listVendors(),
    listLocations(),
    getAppSettings(),
  ]);
  if (!spool) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit spool #${spool.code}`} />
      <SpoolForm
        mode="edit"
        action={updateSpoolAction.bind(null, spool.id)}
        filaments={filaments}
        vendors={vendors.map((v) => v.name)}
        locations={locations}
        currency={settings.currency}
        defaults={{ ...spool, vendorName: spool.vendor?.name }}
      />
    </div>
  );
}
