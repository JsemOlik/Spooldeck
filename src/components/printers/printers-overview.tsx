import Link from "next/link";
import { ColorSwatch } from "@/components/color-swatch";
import { PrinterStateBadge } from "@/components/printers/printer-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatGrams } from "@/lib/format";
import { spoolLabel } from "@/lib/spool-label";
import { type PrinterView, loadedSpools } from "@/server/services/printers";

/** A compact list of printers with what they're printing and which spool is loaded. */
export function PrintersOverview({ printers }: { printers: PrinterView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Printers
          <Link href="/printers" className="text-primary text-sm font-normal hover:underline">
            Manage →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {printers.map((p) => {
            const loaded = loadedSpools(p);
            const spools = loaded.length === 1 ? spoolLabel(loaded[0]) : loaded.length ? `${loaded.length} spools loaded` : "No spool loaded";
            return (
            <li key={p.id}>
              <Link href={loaded.length === 1 ? `/spools/${loaded[0].id}` : "/printers"} className="flex items-center gap-3 py-2">
                <span className="flex shrink-0 -space-x-3">
                  {(loaded.length ? loaded : [null]).map((s, i) => (
                    <ColorSwatch key={s?.id ?? i} hex={s?.colorHex} className="ring-card size-7 ring-2" />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <PrinterStateBadge printer={p} />
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {[p.job?.printName, spools].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {p.job?.usage === "counting" && loaded.length > 0 && (
                  <span className="text-sm font-semibold tabular">{formatGrams(p.job.grams, { precise: true })}</span>
                )}
              </Link>
            </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
