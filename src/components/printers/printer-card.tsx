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
import type { PrinterView } from "@/server/services/printers";

export function PrinterCard({ printer, spools }: { printer: PrinterView; spools: SpoolChoice[] }) {
  const [pending, startTransition] = useTransition();
  const [spoolId, setSpoolId] = useOptimistic(printer.spool?.id ?? null);
  const { detail } = printerState(printer);
  const progress = printer.live?.state === "printing" || printer.live?.state === "paused" ? printer.live.progress : null;
  // The loaded spool may be empty or archived by now, so it isn't always in the stock list.
  const choices = printer.spool && !spools.some((s) => s.id === printer.spool!.id) ? [printer.spool, ...spools] : spools;

  function load(next: number | null) {
    startTransition(async () => {
      setSpoolId(next);
      const result = await loadSpoolAction(printer.id, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
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
        {printer.job && (
          <div className="bg-muted/50 grid gap-2 rounded-lg p-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{printer.job.printName}</span>
              {printer.spool && <span className="shrink-0 font-semibold tabular">{formatGrams(printer.job.grams, { precise: true })}</span>}
            </div>
            {progress != null && <Progress value={progress * 100} aria-label="Print progress" />}
            <p className="text-muted-foreground text-xs">
              {printer.spool
                ? "Used so far from the loaded spool. It updates while the print runs."
                : "No spool loaded, so this print isn't being counted yet. Pick the spool and it counts from the start."}
            </p>
          </div>
        )}
        <Field label="Loaded spool" htmlFor={`printer-${printer.id}-spool`}>
          <SpoolSelect
            id={`printer-${printer.id}-spool`}
            spools={choices}
            value={spoolId}
            onChange={load}
            noneLabel="No spool loaded"
            disabled={pending}
          />
        </Field>
        {printer.spool && (
          <Link href={`/spools/${printer.spool.id}`} className="text-primary text-sm hover:underline">
            Open spool · {formatGrams(Math.max(0, printer.spool.remaining), { precise: true })} left →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
