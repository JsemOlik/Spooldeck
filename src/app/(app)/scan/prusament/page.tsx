import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2Icon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { PageHeader } from "@/components/page-header";
import { ImportForm } from "@/components/scan/import-form";
import { SpecList } from "@/components/spec-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listVendors } from "@/db/queries/catalog";
import { findFilamentByGoodsId } from "@/db/queries/filaments";
import { getSpoolIdByPrusamentId, listLocations } from "@/db/queries/spools";
import { formatDate, formatGrams, formatLength, formatMoney, formatRange } from "@/lib/format";
import { strParam } from "@/lib/params";
import {
  PrusamentError,
  type PrusamentPrice,
  fetchPrusamentSpool,
  mapPrusamentData,
  parsePrusamentUrl,
  pickPrice,
  prusamentSpoolUrl,
} from "@/lib/prusament";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Import Prusament spool" };

export default async function PrusamentImportPage({ searchParams }: PageProps<"/scan/prusament">) {
  const raw = strParam((await searchParams).u) ?? "";
  const ref = parsePrusamentUrl(raw);
  if (!ref) redirect("/scan");
  const existing = await getSpoolIdByPrusamentId(ref.spoolId);
  if (existing) redirect(`/spools/${existing}`);

  const url = prusamentSpoolUrl(ref);
  let mapped;
  let prices: PrusamentPrice[] = [];
  let error: string | null = null;
  try {
    const page = await fetchPrusamentSpool(ref);
    mapped = mapPrusamentData(page.data, ref);
    prices = page.prices;
  } catch (e) {
    error = e instanceof PrusamentError ? e.message : "Something went wrong talking to prusament.com.";
  }

  if (!mapped) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Import Prusament spool" />
        <Card>
          <CardContent className="grid gap-4">
            <div className="text-destructive flex items-center gap-2 font-medium">
              <TriangleAlertIcon className="size-5" />
              {error}
            </div>
            <p className="text-muted-foreground text-sm break-all">{url}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/scan/prusament?u=${encodeURIComponent(url)}`}>Try again</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/spools/new">Add it manually</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { filament: f, spool: s } = mapped;
  const [known, settings, vendors, locations] = await Promise.all([
    f.prusamentGoodsId ? findFilamentByGoodsId(f.prusamentGoodsId) : undefined,
    getAppSettings(),
    listVendors(),
    listLocations(),
  ]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Import Prusament spool" description="Data pulled from prusament.com. Add what Prusa doesn't know: price, shop and where you keep it." />
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4">
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="" className="size-24 rounded-lg border bg-white object-contain" />
          ) : (
            <ColorSwatch hex={f.colorHex} className="size-16" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <ColorSwatch hex={f.colorHex} className="size-4" />
              Prusament · {f.material}
            </div>
            <div className="text-xl font-semibold">{f.colorName || f.name}</div>
            <div className="text-muted-foreground text-sm">{f.name}</div>
            <div className="mt-2 flex items-center gap-1.5 text-sm">
              {known ? (
                <>
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                  Adds a spool to your existing filament
                  <Link href={`/filaments/${known.id}`} className="text-primary hover:underline">
                    {known.colorName || known.name}
                  </Link>
                </>
              ) : (
                <span className="text-muted-foreground">New filament. It will be created with these specs.</span>
              )}
            </div>
          </div>
          <a href={url} target="_blank" rel="noreferrer noopener" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
            prusament.com <ExternalLinkIcon className="size-3" />
          </a>
        </CardContent>
        <CardContent>
          <SpecList
            items={[
              ["Filament weight", formatGrams(s.initialWeight, { precise: true })],
              ["Empty spool", s.spoolWeight != null ? formatGrams(s.spoolWeight) : null],
              ["Length", s.lengthM ? formatLength(s.lengthM) : null],
              ["Nozzle", formatRange(f.nozzleMin, f.nozzleMax)],
              ["Bed", formatRange(f.bedMin, f.bedMax)],
              ["Diameter", s.diameterTolerance != null ? `1.75 ± ${s.diameterTolerance} mm` : null],
              ["Std. deviation", s.diameterSd != null ? `${s.diameterSd.toFixed(2)} µm` : null],
              ["Manufactured", s.manufactureDate ? formatDate(s.manufactureDate) : null],
              ["List price", prices.length ? prices.map((p) => formatMoney(p.amount, p.currency)).join(" / ") : null],
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Purchase details</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm
            url={url}
            currency={settings.currency}
            listPrice={pickPrice(prices, settings.currency)}
            vendors={vendors.map((v) => v.name)}
            locations={locations}
            initialWeight={s.initialWeight}
          />
        </CardContent>
      </Card>
    </div>
  );
}
