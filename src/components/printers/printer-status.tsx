import { Badge } from "@/components/ui/badge";
import type { PrinterView } from "@/server/services/printers";

type State = { label: string; variant: "default" | "secondary" | "outline" | "destructive"; detail?: string | null };

export function printerState(p: PrinterView): State {
  const live = p.live;
  if (!live) return { label: "Connecting…", variant: "outline" };
  if (!live.online) return { label: "Offline", variant: "destructive", detail: live.error };
  switch (live.state) {
    case "printing":
      return { label: live.progress != null ? `Printing · ${Math.round(live.progress * 100)}%` : "Printing", variant: "default" };
    case "paused":
      return { label: "Paused", variant: "secondary" };
    case "complete":
      return { label: "Finished", variant: "outline" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    case "error":
      return { label: "Error", variant: "destructive", detail: live.message };
    default:
      return { label: "Idle", variant: "outline" };
  }
}

export function PrinterStateBadge({ printer }: { printer: PrinterView }) {
  const { label, variant } = printerState(printer);
  return <Badge variant={variant}>{label}</Badge>;
}
