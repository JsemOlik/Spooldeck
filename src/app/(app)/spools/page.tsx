import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpenIcon, PlusIcon, TagIcon } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { SpoolCard } from "@/components/spools/spool-card";
import { STATUS_LABELS } from "@/components/spools/status-badge";
import { Button } from "@/components/ui/button";
import { SPOOL_STATUSES } from "@/db/schema";
import { listBrands, listMaterials } from "@/db/queries/catalog";
import { listLocations, listSpools } from "@/db/queries/spools";
import { formatGrams } from "@/lib/format";
import { intParam, oneOf, strParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Spools" };

const STATUS_FILTERS = ["active", ...SPOOL_STATUSES, "all"] as const;
const SORTS = ["name", "remaining", "recent", "used"] as const;

export default async function SpoolsPage({ searchParams }: PageProps<"/spools">) {
  const sp = await searchParams;
  const settings = await getAppSettings();
  const low = strParam(sp.low) === "1";
  const [spools, materials, brands, locations] = await Promise.all([
    listSpools({
      q: strParam(sp.q),
      materialId: intParam(sp.material),
      brandId: intParam(sp.brand),
      filamentId: intParam(sp.filament),
      location: strParam(sp.location),
      status: oneOf(sp.status, STATUS_FILTERS) ?? "active",
      sort: oneOf(sp.sort, SORTS) ?? "name",
      lowStockGrams: low ? settings.lowStockGrams : undefined,
    }),
    listMaterials(),
    listBrands(),
    listLocations(),
  ]);
  const total = spools.reduce((s, x) => s + Math.max(0, x.remaining), 0);

  return (
    <>
      <PageHeader
        title="Spools"
        description={`${spools.length} spool${spools.length === 1 ? "" : "s"} · ${formatGrams(total)} of filament`}
        actions={
          <>
            {spools.length > 0 && (
              <Button asChild variant="outline">
                <Link href={`/labels?spools=${spools.map((s) => s.id).join(",")}`}>
                  <TagIcon />
                  Labels
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/spools/new">
                <PlusIcon />
                Add spool
              </Link>
            </Button>
          </>
        }
      />
      <ListFilters
        placeholder="Search color, brand, code, location…"
        selects={[
          { name: "material", label: "Materials", options: materials.map((m) => ({ value: String(m.id), label: m.name })) },
          { name: "brand", label: "Brands", options: brands.map((b) => ({ value: String(b.id), label: b.name })) },
          ...(locations.length
            ? [{ name: "location", label: "Locations", options: locations.map((l) => ({ value: l, label: l })) }]
            : []),
          {
            name: "status",
            label: "Status",
            allLabel: "In stock",
            options: [...SPOOL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })), { value: "all", label: "Any status" }],
          },
          {
            name: "sort",
            label: "Sort",
            allLabel: "Sort: name",
            options: [
              { value: "remaining", label: "Sort: least left" },
              { value: "recent", label: "Sort: newest" },
              { value: "used", label: "Sort: last used" },
            ],
          },
        ]}
      />
      {spools.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <PackageOpenIcon className="size-10" />
          <p>No spools match.</p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/scan">Scan a Prusament QR</Link>
            </Button>
            <Button asChild>
              <Link href="/spools/new">Add manually</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spools.map((s) => (
            <SpoolCard key={s.id} spool={s} lowStockGrams={settings.lowStockGrams} />
          ))}
        </div>
      )}
    </>
  );
}
