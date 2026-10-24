import type { Metadata } from "next";
import { PlusIcon, PrinterIcon } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { PrinterCard } from "@/components/printers/printer-card";
import { PrinterDialog } from "@/components/printers/printer-dialog";
import type { SpoolChoice } from "@/components/spools/spool-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listSpools } from "@/db/queries/spools";
import { isPrinting, listPrinters } from "@/server/services/printers";

export const metadata: Metadata = { title: "Printers" };

export default async function PrintersPage() {
  const [printers, spools] = await Promise.all([listPrinters(), listSpools({ status: "active" })]);
  const choices: SpoolChoice[] = spools.map((s) => ({
    id: s.id,
    code: s.code,
    remaining: s.remaining,
    filamentName: s.filamentName,
    colorName: s.colorName,
    colorHex: s.colorHex,
    brandName: s.brandName,
  }));
  const addButton = (
    <PrinterDialog
      trigger={
        <Button>
          <PlusIcon />
          Add printer
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Printers"
        description="Klipper printers report what they print, and the filament comes off the loaded spool as it goes."
        actions={printers.length > 0 && addButton}
      />
      {printers.length > 0 && <AutoRefresh seconds={printers.some(isPrinting) ? 3 : 10} />}
      {printers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <PrinterIcon className="text-muted-foreground size-10" />
            <div className="font-medium">No printers yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Connect a Klipper printer through Moonraker and pick the spool that&apos;s loaded. While it prints, the spool&apos;s
              remaining weight goes down live.
            </p>
            {addButton}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {printers.map((p) => (
            <PrinterCard key={p.id} printer={p} spools={choices} />
          ))}
        </div>
      )}
    </>
  );
}
