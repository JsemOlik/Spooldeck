import Link from "next/link";
import { MapPinIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { RemainingBar } from "@/components/spools/remaining-bar";
import { StatusBadge } from "@/components/spools/status-badge";
import type { SpoolRow } from "@/db/queries/spools";
import { formatGrams } from "@/lib/format";

export function SpoolCard({ spool, lowStockGrams }: { spool: SpoolRow; lowStockGrams: number }) {
  const low = spool.status !== "empty" && spool.remaining <= lowStockGrams;
  return (
    <Link
      href={`/spools/${spool.id}`}
      className="bg-card hover:border-primary/40 group flex flex-col gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start gap-3">
        <ColorSwatch hex={spool.colorHex} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground truncate text-xs">
            {[spool.brandName, spool.materialName].filter(Boolean).join(" · ") || "Unknown"}
          </div>
          <div className="truncate font-medium">{spool.colorName || spool.filamentName}</div>
          {spool.colorName && <div className="text-muted-foreground truncate text-xs">{spool.filamentName}</div>}
        </div>
        <StatusBadge status={spool.status} />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className={low ? "text-destructive font-semibold tabular" : "font-semibold tabular"}>
            {formatGrams(Math.max(0, spool.remaining))}
          </span>
          <span className="text-muted-foreground text-xs tabular">of {formatGrams(spool.initialWeight)}</span>
        </div>
        <RemainingBar initial={spool.initialWeight} remaining={spool.remaining} low={low} />
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="font-mono">#{spool.code}</span>
        {spool.location && (
          <span className="flex items-center gap-1 truncate">
            <MapPinIcon className="size-3" />
            {spool.location}
          </span>
        )}
      </div>
    </Link>
  );
}
