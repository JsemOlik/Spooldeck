import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, TagIcon } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ColorSwatch } from "@/components/color-swatch";
import { PageHeader } from "@/components/page-header";
import { PrinterCard } from "@/components/printers/printer-card";
import { MotionIcon } from "@/components/printers/motion-icon";
import { PrinterDialog } from "@/components/printers/printer-dialog";
import { PrinterStateBadge } from "@/components/printers/printer-status";
import { UsageChart } from "@/components/printers/usage-chart";
import type { SpoolChoice } from "@/components/spools/spool-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { type PrintStatus, getPrinterHistory, getPrinterSuggestions } from "@/db/queries/printers";
import { listSpools } from "@/db/queries/spools";
import { formatDate, formatDateTime, formatGrams, formatMoney, relativeTime } from "@/lib/format";
import { intParam } from "@/lib/params";
import { MOTION_LABEL } from "@/lib/printers/motion";
import { getAppSettings } from "@/lib/settings";
import { isPrinting, listPrinters, loadedElsewhere } from "@/server/services/printers";

const KIND_LABEL = { moonraker: "Klipper", prusalink: "PrusaLink" } as const;

const STATUS_BADGE: Record<Exclude<PrintStatus, "printed">, { label: string; variant: "default" | "outline" | "destructive" }> = {
  printing: { label: "Printing", variant: "default" },
  cancelled: { label: "Cancelled", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export async function generateMetadata({ params }: PageProps<"/printers/[id]">): Promise<Metadata> {
  const id = intParam((await params).id);
  const printer = id ? await db.query.printers.findFirst({ where: (p, { eq }) => eq(p.id, id), columns: { name: true } }) : null;
  return { title: printer?.name ?? "Printer" };
}

export default async function PrinterPage({ params }: PageProps<"/printers/[id]">) {
  const id = intParam((await params).id);
  if (!id) notFound();
  const settings = await getAppSettings();
  const [printers, history, spools, suggestions] = await Promise.all([
    listPrinters(),
    getPrinterHistory(id, settings.currency),
    listSpools({ status: "active" }),
    getPrinterSuggestions(),
  ]);
  const printer = printers.find((p) => p.id === id);
  if (!printer) notFound();

  const choices: SpoolChoice[] = spools.map((s) => ({
    id: s.id,
    code: s.code,
    remaining: s.remaining,
    filamentName: s.filamentName,
    colorName: s.colorName,
    colorHex: s.colorHex,
    brandName: s.brandName,
  }));
  const maxFilament = Math.max(1, ...history.byFilament.map((f) => f.grams));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const makeModel = [printer.brand, printer.model].filter(Boolean).join(" ");
  const editDialog = (trigger: React.ReactNode) => <PrinterDialog printer={printer} suggestions={suggestions} trigger={trigger} />;
  const details: [string, React.ReactNode][] = [
    // Brand, model and motion system head the card.
    ["Location", printer.location],
    ["Tools", printer.tools > 1 ? String(printer.tools) : null],
    ["Connection", KIND_LABEL[printer.kind]],
    ["Address", <span key="url" className="break-all">{printer.url}</span>],
  ];

  return (
    <>
      <AutoRefresh seconds={isPrinting(printer) ? 3 : 10} />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {printer.name}
            <PrinterStateBadge printer={printer} />
          </span>
        }
        description={[makeModel, printer.location].filter(Boolean).join(" · ") || KIND_LABEL[printer.kind]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/labels?printers=${printer.id}`}>
                <TagIcon />
                Print label
              </Link>
            </Button>
            {editDialog(
              <Button variant="outline">
                <PencilIcon />
                Edit
              </Button>,
            )}
          </>
        }
      />

      <div className="grid gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className="self-start">
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-muted/60 flex size-20 shrink-0 items-center justify-center rounded-xl">
                  <MotionIcon motion={printer.motion} className="size-14" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{makeModel || printer.name}</div>
                  <div className="text-muted-foreground text-sm">
                    {printer.motion ? MOTION_LABEL[printer.motion] : "Motion system not set"}
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {details
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="col-span-2 grid grid-cols-subgrid">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0">{value}</dd>
                    </div>
                  ))}
              </dl>
              {!(printer.brand || printer.model || printer.motion || printer.location) &&
                editDialog(
                  <Button variant="outline" size="sm" className="justify-self-start">
                    <PencilIcon />
                    Add brand, model and location
                  </Button>,
                )}
            </CardContent>
          </Card>
          <PrinterCard printer={printer} spools={choices} elsewhere={loadedElsewhere(printers, printer.id)} header={false} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Prints", String(history.prints), history.firstAt ? `since ${formatDate(history.firstAt)}` : "none counted yet"],
            ["Filament used", formatGrams(history.grams), "on this printer"],
            ["Last 30 days", formatGrams(history.grams30), `${plural(history.prints30, "print")}`],
            [
              "Filament cost",
              history.cost != null ? formatMoney(history.cost, settings.currency) : "—",
              history.cost != null ? "from spool prices" : "no spool prices set",
            ],
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Filament used · last 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                <UsageChart days={history.days} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent prints</CardTitle>
              </CardHeader>
              <CardContent>
                {history.recent.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No prints yet. Load a spool above, and what this printer prints comes off it as it goes.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {history.recent.map((p) => (
                      <li key={p.key} className="flex items-center gap-3 py-2.5">
                        <span className="flex shrink-0 -space-x-3">
                          {p.spools.map((s) => (
                            <ColorSwatch key={s.id} hex={s.colorHex} className="ring-card size-7 ring-2" />
                          ))}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">{p.name}</span>
                            {p.status !== "printed" && <Badge variant={STATUS_BADGE[p.status].variant}>{STATUS_BADGE[p.status].label}</Badge>}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            <span title={formatDateTime(p.startedAt)}>{relativeTime(p.startedAt)}</span>
                            {p.spools.map((s) => (
                              <span key={s.id}>
                                {" · "}
                                <Link href={`/spools/${s.id}`} className="hover:text-foreground hover:underline">
                                  {s.colorName || s.filamentName} #{s.code}
                                </Link>
                                {p.spools.length > 1 && ` ${formatGrams(s.grams, { precise: true })}`}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular">{formatGrams(p.grams, { precise: true })}</div>
                          {p.cost != null && <div className="text-muted-foreground text-xs tabular">{formatMoney(p.cost, settings.currency)}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="self-start">
            <CardHeader>
              <CardTitle>Most used filaments</CardTitle>
            </CardHeader>
            <CardContent>
              {history.byFilament.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing printed yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {history.byFilament.map((f) => (
                    <li key={f.filamentId}>
                      <Link href={`/filaments/${f.filamentId}`} className="flex items-center gap-3">
                        <ColorSwatch hex={f.colorHex} className="size-7" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate font-medium">
                              {f.colorName || f.filamentName}
                              {f.materialName && <span className="text-muted-foreground font-normal"> · {f.materialName}</span>}
                            </span>
                            <span className="font-semibold tabular">{formatGrams(f.grams)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                              <div className="bg-primary h-full rounded-full" style={{ width: `${(f.grams / maxFilament) * 100}%` }} />
                            </div>
                            <span className="text-muted-foreground shrink-0 text-xs tabular">{plural(f.prints, "print")}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
