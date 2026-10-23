"use client";

import { useTransition } from "react";
import { Undo2Icon } from "lucide-react";
import { deleteUsageAction } from "@/actions/spools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UsageLog } from "@/db/schema";
import { formatDateTime, formatGrams, formatMoney } from "@/lib/format";

const KIND_LABEL = { print: "Print", adjustment: "Adjustment", weigh_in: "Weigh-in" } as const;

export function UsageHistory({
  entries,
  pricePerGram,
  currency,
}: {
  entries: UsageLog[];
  pricePerGram: number | null;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">Nothing logged yet.</p>;
  return (
    <ul className={pending ? "divide-y opacity-60" : "divide-y"}>
      {entries.map((e) => (
        <li key={e.id} className="group flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{e.printName || KIND_LABEL[e.kind]}</span>
              {e.kind !== "print" && e.printName && <Badge variant="outline">{KIND_LABEL[e.kind]}</Badge>}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {formatDateTime(e.createdAt)}
              {e.note ? ` · ${e.note}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular">
              {e.grams > 0 ? "−" : "+"}
              {formatGrams(Math.abs(e.grams), { precise: true })}
            </div>
            {pricePerGram != null && e.grams > 0 && (
              <div className="text-muted-foreground text-xs tabular">{formatMoney(e.grams * pricePerGram, currency)}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Undo entry"
            title="Remove entry"
            className="opacity-60 group-hover:opacity-100"
            onClick={() => {
              if (confirm("Remove this entry? The weight is added back.")) startTransition(() => deleteUsageAction(e.id));
            }}
          >
            <Undo2Icon />
          </Button>
        </li>
      ))}
    </ul>
  );
}
