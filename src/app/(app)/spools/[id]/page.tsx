import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon, MapPinIcon, PrinterIcon } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ColorSwatch } from "@/components/color-swatch";
import { NoteForm, NotesList } from "@/components/filaments/notes";
import { printerState } from "@/components/printers/printer-status";
import { SpecList } from "@/components/spec-list";
import { RemainingBar } from "@/components/spools/remaining-bar";
import { SpoolActionsMenu } from "@/components/spools/spool-actions-menu";
import { StatusBadge } from "@/components/spools/status-badge";
import { LogUsageDialog, WeighInDialog } from "@/components/spools/usage-dialogs";
import { UsageHistory } from "@/components/spools/usage-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { getSpoolDetail } from "@/db/queries/spools";
import { getBaseUrl } from "@/lib/base-url";
import { formatDate, formatGrams, formatLength, formatMoney, formatRange } from "@/lib/format";
import { intParam } from "@/lib/params";
import { qrSvg, spoolUrl } from "@/lib/qr";
import { getAppSettings } from "@/lib/settings";
import { estimateLengthM, pricePerGram } from "@/lib/weights";
import { isPrinting, listPrinters, toolLabel } from "@/server/services/printers";

export async function generateMetadata({ params }: PageProps<"/spools/[id]">): Promise<Metadata> {
  const id = intParam((await params).id);
  const spool = id ? await db.query.spools.findFirst({ where: (s, { eq }) => eq(s.id, id), with: { filament: true } }) : null;
  return { title: spool ? `${spool.filament.colorName || spool.filament.name} #${spool.code}` : "Spool" };
}

export default async function SpoolPage({ params, searchParams }: PageProps<"/spools/[id]">) {
  const id = intParam((await params).id);
  if (!id) notFound();
  const [spool, settings, sp, printers] = await Promise.all([getSpoolDetail(id), getAppSettings(), searchParams, listPrinters()]);
  if (!spool) notFound();

  const f = spool.filament;
  const currency = spool.currency ?? settings.currency;
  const remaining = Math.max(0, spool.remaining);
  const low = spool.status !== "empty" && remaining <= settings.lowStockGrams;
  const ppg = pricePerGram(spool.price, spool.initialWeight);
  const nozzle = formatRange(f.nozzleMin ?? f.material?.nozzleMin, f.nozzleMax ?? f.material?.nozzleMax);
  const bed = formatRange(f.bedMin ?? f.material?.bedMin, f.bedMax ?? f.material?.bedMax);
  const url = spoolUrl(await getBaseUrl(), spool.code);
  const qr = await qrSvg(url);
  const notes = await db.query.filamentNotes.findMany({
    where: (n, { eq }) => eq(n.filamentId, f.id),
    orderBy: (n, { desc }) => [desc(n.createdAt)],
    limit: 5,
    with: { spool: { columns: { id: true, code: true } } },
  });
  const scanned = sp.scanned === "1";
  const loadedOn = printers.find((p) => p.slots.some((s) => s.spool?.id === spool.id));
  const loadedTool = loadedOn?.slots.find((s) => s.spool?.id === spool.id)?.tool ?? 0;

  return (
    <div className="grid gap-6">
      {loadedOn && <AutoRefresh seconds={isPrinting(loadedOn) ? 3 : 15} />}
      <div className="flex flex-wrap items-start gap-4">
        <ColorSwatch hex={f.colorHex} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground text-sm">
            {[f.brand?.name, f.material?.name].filter(Boolean).join(" · ")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{f.colorName || f.name}</h1>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link href={`/filaments/${f.id}`} className="hover:text-foreground underline-offset-4 hover:underline">
              {f.name}
            </Link>
            <span className="font-mono">#{spool.code}</span>
            <StatusBadge status={spool.status} />
            {spool.location && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" />
                {spool.location}
              </span>
            )}
            {loadedOn && (
              <Link href={`/printers/${loadedOn.id}`} className="hover:text-foreground flex items-center gap-1">
                <PrinterIcon className="size-3.5" />
                On {toolLabel(loadedOn, loadedTool)} · {printerState(loadedOn).label}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-muted-foreground text-sm">Remaining</div>
              <div className={low ? "text-destructive text-4xl font-semibold tabular" : "text-4xl font-semibold tabular"}>
                {formatGrams(remaining, { precise: true })}
              </div>
            </div>
            <div className="text-muted-foreground text-right text-sm tabular">
              <div>≈ {formatLength(estimateLengthM(remaining, f.diameter, f.material?.density ?? undefined))}</div>
              <div>
                {formatGrams(spool.used, { precise: true })} used of {formatGrams(spool.initialWeight, { precise: true })}
              </div>
            </div>
          </div>
          <RemainingBar initial={spool.initialWeight} remaining={remaining} low={low} className="h-2.5" />
          <div className="flex gap-2">
            <LogUsageDialog spoolId={spool.id} remaining={remaining} defaultOpen={scanned} />
            <WeighInDialog spoolId={spool.id} spoolWeight={spool.spoolWeight} />
            <SpoolActionsMenu
              spoolId={spool.id}
              filamentId={f.id}
              status={spool.status}
              printers={printers.map((p) => ({
                id: p.id,
                name: p.name,
                tools: p.tools,
                loadedTool: p.id === loadedOn?.id ? loadedTool : null,
                slots: p.slots.map((s) => ({ colorHex: s.spool?.colorHex ?? null, name: s.spool ? s.spool.colorName || s.spool.filamentName : null })),
              }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage history</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageHistory entries={spool.usage} pricePerGram={ppg} currency={currency} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notes for this filament</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <NoteForm filamentId={f.id} spoolId={spool.id} />
              <NotesList notes={notes} />
              {notes.length >= 5 && (
                <Link href={`/filaments/${f.id}#notes`} className="text-primary text-sm hover:underline">
                  All notes →
                </Link>
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
                  ["Nozzle", nozzle],
                  ["Bed", bed],
                  ["Diameter", `${f.diameter} mm`],
                  ["Drying", f.dryingTemp ? `${f.dryingTemp} °C${f.dryingHours ? ` · ${f.dryingHours} h` : ""}` : null],
                  ["Max speed", f.maxSpeed ? `${f.maxSpeed} mm/s` : null],
                  ["Fan", f.fan],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Purchase</CardTitle>
            </CardHeader>
            <CardContent>
              <SpecList
                items={[
                  ["Price", spool.price != null ? formatMoney(spool.price, currency) : null],
                  ["Per kg", ppg != null ? formatMoney(ppg * 1000, currency) : null],
                  ["Bought from", spool.vendor?.name],
                  ["Purchased", spool.purchaseDate ? formatDate(spool.purchaseDate) : null],
                  ["Opened", spool.openedAt ? formatDate(spool.openedAt) : null],
                  ["Empty spool", spool.spoolWeight != null ? formatGrams(spool.spoolWeight) : null],
                  [
                    "Link",
                    spool.purchaseUrl ? (
                      <a href={spool.purchaseUrl} target="_blank" rel="noreferrer noopener" className="text-primary inline-flex items-center gap-1 hover:underline">
                        Open <ExternalLinkIcon className="size-3" />
                      </a>
                    ) : null,
                  ],
                ]}
              />
              {spool.notes && <p className="text-muted-foreground mt-4 text-sm whitespace-pre-wrap">{spool.notes}</p>}
            </CardContent>
          </Card>
          {spool.prusamentSpoolId && (
            <Card>
              <CardHeader>
                <CardTitle>Prusament data</CardTitle>
              </CardHeader>
              <CardContent>
                <SpecList
                  items={[
                    ["Manufactured", spool.manufactureDate ? formatDate(spool.manufactureDate) : null],
                    ["Length", spool.lengthM ? formatLength(spool.lengthM) : null],
                    ["Diameter", spool.diameterTolerance != null ? `${f.diameter} ± ${spool.diameterTolerance} mm` : null],
                    ["Diameter σ", spool.diameterSd != null ? `${spool.diameterSd.toFixed(2)} µm` : null],
                    ["Ovality", spool.ovality != null ? `${spool.ovality.toFixed(1)} %` : null],
                    [
                      "Spool page",
                      <a
                        key="p"
                        href={`https://prusament.com/spool/${spool.prusamentSpoolId}/`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        prusament.com <ExternalLinkIcon className="size-3" />
                      </a>,
                    ],
                  ]}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>QR code</CardTitle>
            </CardHeader>
            <CardContent className="grid justify-items-center gap-3">
              <div className="size-36 rounded-md bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
              <code className="text-muted-foreground text-xs break-all">{url}</code>
              <Link href={`/labels?spools=${spool.id}`} className="text-primary text-sm hover:underline">
                Design &amp; print a label →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
