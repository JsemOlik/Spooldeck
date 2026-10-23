import { Badge } from "@/components/ui/badge";
import type { SpoolStatus } from "@/db/schema";

const LABELS: Record<SpoolStatus, string> = {
  sealed: "Sealed",
  opened: "Open",
  empty: "Empty",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: SpoolStatus }) {
  const variant = status === "opened" ? "default" : status === "sealed" ? "secondary" : "outline";
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}

export const STATUS_LABELS = LABELS;
