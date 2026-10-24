"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { PencilIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { loadSpoolAction } from "@/actions/printers";
import { Field } from "@/components/forms/field";
import { PrinterDialog } from "@/components/printers/printer-dialog";
import { PrinterStateBadge, printerState } from "@/components/printers/printer-status";
import { type SpoolChoice, SpoolSelect } from "@/components/spools/spool-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatGrams } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PrinterView } from "@/server/services/printers";

type Loaded = (number | null)[];

export function PrinterCard({ printer, spools }: { printer: PrinterView; spools: SpoolChoice[] }) {
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useOptimistic<Loaded, { tool: number; spoolId: number | null }>(
    printer.slots.map((s) => s.spool?.id ?? null),
    // A spool is only on one tool, so loading it elsewhere takes it off the other.
    (current, { tool, spoolId }) => current.map((id, t) => (t === tool ? spoolId : id === spoolId ? null : id)),
  );
  const { detail } = printerState(printer);
  const progress = printer.live?.state === "printing" || printer.live?.state === "paused" ? printer.live.progress : null;
  const multi = printer.tools > 1;
  const anyLoaded = printer.slots.some((s) => s.spool);
  // Loaded spools may be empty or archived by now, so they aren't always in the stock list.
  const extra = printer.slots.flatMap((s) => (s.spool && !spools.some((c) => c.id === s.spool!.id) ? [s.spool] : []));
  const choices = [...extra, ...spools];
  const job = printer.job;

  function load(tool: number, spoolId: number | null) {
    startTransition(async () => {
      setLoaded({ tool, spoolId });
      const result = await loadSpoolAction(printer.id, spoolId, tool);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error ?? "Couldn't load the spool");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <PrinterIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{printer.name}</CardTitle>
            <CardDescription className="truncate">{printer.url}</CardDescription>
          </div>
          <PrinterStateBadge printer={printer} />
          <PrinterDialog
            printer={printer}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${printer.name}`} className="-mt-1">
                <PencilIcon />
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {detail && <p className="text-destructive text-sm">{detail}</p>}
        {job && (
          <div className="bg-muted/50 grid gap-2 rounded-lg p-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{job.printName}</span>
              {anyLoaded && job.usage === "counting" && (
                <span className="shrink-0 font-semibold tabular">{formatGrams(job.grams, { precise: true })}</span>
              )}
            </div>
            {progress != null && <Progress value={progress * 100} aria-label="Print progress" />}
            <p className="text-muted-foreground text-xs">{jobHint(printer, anyLoaded)}</p>
          </div>
        )}
        <div className={cn("grid gap-4", multi && "sm:grid-cols-2")}>
          {printer.slots.map((slot) => {
            const id = `printer-${printer.id}-tool-${slot.tool}`;
            return (
              <Field
                key={slot.tool}
                label={multi ? `Tool ${slot.tool + 1}` : "Loaded spool"}
                htmlFor={id}
                hint={
                  slot.spool && (
                    <>
                      <Link href={`/spools/${slot.spool.id}`} className="text-primary hover:underline">
                        Open spool · {formatGrams(Math.max(0, slot.spool.remaining), { precise: true })} left →
                      </Link>
                      {multi && slot.grams != null && <> · {formatGrams(slot.grams, { precise: true })} this print</>}
                    </>
                  )
                }
              >
                <SpoolSelect
                  id={id}
                  spools={choices}
                  value={loaded[slot.tool] ?? null}
                  onChange={(spoolId) => load(slot.tool, spoolId)}
                  noneLabel="No spool loaded"
                  disabled={pending}
                />
              </Field>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function jobHint(printer: PrinterView, anyLoaded: boolean) {
  if (printer.job?.usage === "missing") {
    return "The print file has no filament stats, so this print can't be counted. Files sliced in PrusaSlicer have them.";
  }
  if (!anyLoaded) return "No spool loaded, so this print isn't being counted yet. Pick the spool and it counts from the start.";
  if (printer.job?.usage === "reading") return "Reading the print file for how much filament it uses…";
  const from = printer.tools > 1 ? "the loaded spools" : "the loaded spool";
  return printer.kind === "prusalink"
    ? `Used so far from ${from}, worked out from the print file and the progress. It updates while the print runs.`
    : `Used so far from ${from}. It updates while the print runs.`;
}
