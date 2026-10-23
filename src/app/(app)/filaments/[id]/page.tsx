import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, PlusIcon, StarIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { FilamentActions } from "@/components/filaments/filament-actions";
import { NoteForm, NotesList } from "@/components/filaments/notes";
import { SpecList } from "@/components/spec-list";
import { StatusBadge } from "@/components/spools/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFilamentDetail } from "@/db/queries/filaments";
import { formatDate, formatGrams, formatMoney, formatRange } from "@/lib/format";
import { intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";
import { pricePerGram } from "@/lib/weights";

export async function generateMetadata({ params }: PageProps<"/filaments/[id]">): Promise<Metadata> {
  const id = intParam((await params).id);
  const f = id ? await getFilamentDetail(id) : null;
  return { title: f ? f.colorName || f.name : "Filament" };
}

export default async function FilamentPage({ params }: PageProps<"/filaments/[id]">) {
  const id = intParam((await params).id);
  if (!id) notFound();
  const [f, settings] = await Promise.all([getFilamentDetail(id), getAppSettings()]);
  if (!f) notFound();

  const spools = f.spools.map((s) => {
    const used = s.usage.reduce((sum, u) => sum + u.grams, 0);
    const printed = s.usage.filter((u) => u.kind === "print").reduce((sum, u) => sum + u.grams, 0);
    return { ...s, used, printed, remaining: s.initialWeight - used, ppg: pricePerGram(s.price, s.initialWeight) };
  });
  const active = spools.filter((s) => s.status === "sealed" || s.status === "opened");
  const inStock = active.reduce((sum, s) => sum + Math.max(0, s.remaining), 0);
  const totalUsed = spools.reduce((sum, s) => sum + Math.max(0, s.used), 0);
  const priced = spools.filter((s) => s.ppg != null && (s.currency ?? settings.currency) === settings.currency);
  const avgPerKg = priced.length ? (priced.reduce((sum, s) => sum + s.ppg!, 0) / priced.length) * 1000 : null;
  const prints = f.spools.flatMap((s) => s.usage).filter((u) => u.kind === "print").length;

  return (
    <div className="grid gap-6">
      {/* On phones the actions drop below the title so the name gets the full width. */}
      <div className="grid gap-4 sm:flex sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="" className="size-16 shrink-0 rounded-lg border bg-white object-contain sm:size-20" />
          ) : (
            <ColorSwatch hex={f.colorHex} className="size-16 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {f.imageUrl && <ColorSwatch hex={f.colorHex} className="size-4" />}
              <span>{[f.brand?.name, f.material?.name, `${f.diameter} mm`].filter(Boolean).join(" · ")}</span>
              {f.archived && <Badge variant="outline">Archived</Badge>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{f.colorName || f.name}</h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-sm">
              {f.colorName && <span>{f.name}</span>}
              {f.rating != null && (
                <span className="flex items-center gap-0.5" aria-label={`Rated ${f.rating} of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <StarIcon key={i} className={i < f.rating! ? "size-3.5 fill-current text-amber-500" : "size-3.5"} />
                  ))}
                </span>
              )}
              {f.productUrl && (
                <a href={f.productUrl} target="_blank" rel="noreferrer noopener" className="text-primary inline-flex items-center gap-1 hover:underline">
                  Product page <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild className="flex-1 sm:flex-none">
            <Link href={`/spools/new?filament=${f.id}`}>
              <PlusIcon />
              Add spool
            </Link>
          </Button>
          <FilamentActions id={f.id} archived={f.archived} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["In stock", formatGrams(inStock), `${active.length} spool${active.length === 1 ? "" : "s"}`],
          ["Used so far", formatGrams(totalUsed), `${prints} print${prints === 1 ? "" : "s"} logged`],
          ["Avg price", avgPerKg != null ? formatMoney(avgPerKg, settings.currency) : "—", "per kg"],
          ["Spools bought", String(spools.length), spools[0]?.vendor?.name ? `last from ${spools[0].vendor.name}` : ""],
        ].map(([label, value, sub]) => (
          <Card key={label} size="sm">
            <CardContent>
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-xl font-semibold tabular">{value}</div>
              <div className="text-muted-foreground truncate text-xs">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <Card id="notes">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <NoteForm filamentId={f.id} />
              <NotesList notes={f.notes} emptyText="Write down what worked: temps, retraction, quirks, which printer…" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Spools &amp; purchases</CardTitle>
            </CardHeader>
            <CardContent>
              {spools.length === 0 ? (
                <p className="text-muted-foreground text-sm">No spools of this filament yet.</p>
              ) : (
                <ul className="divide-y">
                  {spools.map((s) => (
                    <li key={s.id}>
                      <Link href={`/spools/${s.id}`} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span className="font-mono">#{s.code}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {[s.purchaseDate ? formatDate(s.purchaseDate) : null, s.vendor?.name, s.location].filter(Boolean).join(" · ") || "No purchase info"}
                          </div>
                        </div>
                        <div className="text-right text-sm tabular">
                          <div>{s.price != null ? formatMoney(s.price, s.currency ?? settings.currency) : "—"}</div>
                          <div className="text-muted-foreground text-xs">
                            {s.ppg != null ? `${formatMoney(s.ppg * 1000, s.currency ?? settings.currency)}/kg` : ""}
                          </div>
                        </div>
                        <div className="w-20 text-right text-sm font-semibold tabular">{formatGrams(Math.max(0, s.remaining))}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Print settings</CardTitle>
            </CardHeader>
            <CardContent>
              <SpecList
                items={[
                  ["Nozzle", formatRange(f.nozzleMin ?? f.material?.nozzleMin, f.nozzleMax ?? f.material?.nozzleMax)],
                  ["Bed", formatRange(f.bedMin ?? f.material?.bedMin, f.bedMax ?? f.material?.bedMax)],
                  ["Drying", f.dryingTemp ? `${f.dryingTemp} °C${f.dryingHours ? ` · ${f.dryingHours} h` : ""}` : null],
                  ["Max speed", f.maxSpeed ? `${f.maxSpeed} mm/s` : null],
                  ["Fan", f.fan],
                  ["Density", f.material?.density ? `${f.material.density} g/cm³` : null],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Spool</CardTitle>
            </CardHeader>
            <CardContent>
              <SpecList
                items={[
                  ["Net weight", formatGrams(f.nominalWeight)],
                  ["Empty spool", f.spoolWeight != null ? formatGrams(f.spoolWeight) : null],
                  ["Color", f.colorHex ? <span className="font-mono">{f.colorHex}</span> : null],
                  ["Prusament ID", f.prusamentGoodsId],
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
