import Link from "next/link";
import { AlertTriangleIcon, PackageIcon, PlusIcon, ScanLineIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { PageHeader } from "@/components/page-header";
import { RemainingBar } from "@/components/spools/remaining-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard } from "@/db/queries/dashboard";
import { formatGrams, formatMoney, relativeTime } from "@/lib/format";
import { getAppSettings } from "@/lib/settings";

export default async function DashboardPage() {
  const settings = await getAppSettings();
  const d = await getDashboard(settings.lowStockGrams, settings.currency);
  const maxMaterial = Math.max(1, ...d.byMaterial.map((m) => m.grams));

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/spools/new">
                <PlusIcon />
                Add spool
              </Link>
            </Button>
            <Button asChild>
              <Link href="/scan">
                <ScanLineIcon />
                Scan
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Spools in stock", String(d.spoolCount), `${d.low.length} running low`],
          ["Filament on hand", formatGrams(d.remaining), "across all spools"],
          ["Inventory value", formatMoney(d.value, settings.currency), "remaining filament"],
          ["Last 30 days", formatGrams(d.used30), `${d.prints30} print${d.prints30 === 1 ? "" : "s"} logged`],
        ].map(([label, value, sub]) => (
          <Card key={label} size="sm">
            <CardContent>
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-2xl font-semibold tabular">{value}</div>
              <div className="text-muted-foreground text-xs">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {d.spoolCount === 0 && d.recent.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <PackageIcon className="text-muted-foreground size-10" />
            <div className="font-medium">Your shelf is empty</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Scan the QR code on a Prusament spool to import it automatically, or add any other filament by hand and print a label for it.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/filaments/new">Add filament</Link>
              </Button>
              <Button asChild>
                <Link href="/scan">Scan a spool</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangleIcon className="text-destructive size-4" />
                Running low
                <span className="text-muted-foreground text-xs font-normal">≤ {formatGrams(settings.lowStockGrams)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {d.low.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing is running low.</p>
              ) : (
                <ul className="grid gap-3">
                  {d.low.slice(0, 8).map((s) => (
                    <li key={s.id}>
                      <Link href={`/spools/${s.id}`} className="flex items-center gap-3">
                        <ColorSwatch hex={s.colorHex} className="size-7" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate font-medium">
                              {s.colorName || s.filamentName}
                              <span className="text-muted-foreground font-normal"> · {s.materialName}</span>
                            </span>
                            <span className="text-destructive font-semibold tabular">{formatGrams(Math.max(0, s.remaining))}</span>
                          </div>
                          <RemainingBar initial={s.initialWeight} remaining={s.remaining} low className="mt-1" />
                        </div>
                      </Link>
                    </li>
                  ))}
                  {d.low.length > 8 && (
                    <Link href="/spools?low=1" className="text-primary text-sm hover:underline">
                      All {d.low.length} low spools →
                    </Link>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent prints</CardTitle>
            </CardHeader>
            <CardContent>
              {d.recent.length === 0 ? (
                <p className="text-muted-foreground text-sm">No prints logged yet. Open a spool and tap “Log usage”.</p>
              ) : (
                <ul className="divide-y">
                  {d.recent.map((u) => (
                    <li key={u.id}>
                      <Link href={`/spools/${u.spoolId}`} className="flex items-center gap-3 py-2">
                        <ColorSwatch hex={u.colorHex} className="size-6" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{u.printName || "Print"}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {u.colorName || u.filamentName} · {relativeTime(u.createdAt)}
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular">{formatGrams(u.grams, { precise: true })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {d.byMaterial.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Usage by material · last 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2">
                  {d.byMaterial.map((m) => (
                    <li key={m.material} className="grid grid-cols-[4rem_1fr_5rem] items-center gap-3 text-sm">
                      <span className="font-medium">{m.material}</span>
                      <div className="bg-muted h-2 overflow-hidden rounded-full">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${(m.grams / maxMaterial) * 100}%` }} />
                      </div>
                      <span className="text-right tabular">{formatGrams(m.grams)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
