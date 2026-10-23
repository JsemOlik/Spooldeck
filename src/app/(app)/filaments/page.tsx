import type { Metadata } from "next";
import Link from "next/link";
import { PaletteIcon, PlusIcon, StarIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { ListFilters } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listBrands, listMaterials } from "@/db/queries/catalog";
import { listFilaments } from "@/db/queries/filaments";
import { formatGrams, formatRange } from "@/lib/format";
import { intParam, strParam } from "@/lib/params";

export const metadata: Metadata = { title: "Filaments" };

export default async function FilamentsPage({ searchParams }: PageProps<"/filaments">) {
  const sp = await searchParams;
  const archived = strParam(sp.archived) === "1";
  const [rows, materials, brands] = await Promise.all([
    listFilaments({ q: strParam(sp.q), materialId: intParam(sp.material), brandId: intParam(sp.brand), archived }),
    listMaterials(),
    listBrands(),
  ]);

  return (
    <>
      <PageHeader
        title="Filaments"
        description="Products you buy: specs, temperatures, prices and notes shared by every spool of it."
        actions={
          <Button asChild>
            <Link href="/filaments/new">
              <PlusIcon />
              Add filament
            </Link>
          </Button>
        }
      />
      <ListFilters
        placeholder="Search name, color, brand…"
        selects={[
          { name: "material", label: "Materials", options: materials.map((m) => ({ value: String(m.id), label: m.name })) },
          { name: "brand", label: "Brands", options: brands.map((b) => ({ value: String(b.id), label: b.name })) },
          { name: "archived", label: "Archived", allLabel: "Active", options: [{ value: "1", label: "Archived" }] },
        ]}
      />
      {rows.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <PaletteIcon className="size-10" />
          <p>No filaments yet.</p>
          <Button asChild>
            <Link href="/filaments/new">Add your first filament</Link>
          </Button>
        </div>
      ) : (
        <div className="bg-card divide-y rounded-xl border">
          {rows.map((f) => (
            <Link key={f.id} href={`/filaments/${f.id}`} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors">
              <ColorSwatch hex={f.colorHex} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.colorName || f.name}</div>
                <div className="text-muted-foreground truncate text-xs">
                  {[f.brandName, f.materialName, `${f.diameter} mm`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="text-muted-foreground hidden text-right text-xs sm:block tabular">
                <div>Nozzle {formatRange(f.nozzleMin, f.nozzleMax)}</div>
                <div>Bed {formatRange(f.bedMin, f.bedMax)}</div>
              </div>
              {f.rating != null && (
                <div className="text-muted-foreground hidden items-center gap-0.5 text-xs md:flex">
                  <StarIcon className="size-3.5 fill-current" />
                  {f.rating}
                </div>
              )}
              <div className="w-24 text-right">
                <div className="text-sm font-semibold tabular">{formatGrams(Math.max(0, f.remaining))}</div>
                <div className="text-muted-foreground text-xs">
                  {f.activeCount} in stock{f.spoolCount > f.activeCount ? ` · ${f.spoolCount - f.activeCount} used up` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
