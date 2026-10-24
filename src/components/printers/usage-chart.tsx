import { formatDate, formatGrams } from "@/lib/format";
import { cn } from "@/lib/utils";

const dayLabel = (d: Date) => formatDate(d, { day: "numeric", month: "short" });

/** Grams used per day as bars, with the day and amount shown on hover or focus. */
export function UsageChart({ days }: { days: { date: Date; grams: number }[] }) {
  const max = Math.max(...days.map((d) => d.grams));
  if (max <= 0) return <p className="text-muted-foreground text-sm">Nothing printed in the last 30 days.</p>;
  const last = days.length - 1;

  return (
    <figure className="grid gap-2">
      <div className="text-muted-foreground text-xs tabular">{formatGrams(max)}</div>
      <div className="border-border flex h-36 items-end gap-0.5 border-b" role="list" aria-label="Filament used per day">
        {days.map((d, i) => (
          <div
            key={i}
            role="listitem"
            tabIndex={0}
            aria-label={`${dayLabel(d.date)}: ${formatGrams(d.grams, { precise: true })}`}
            className="group relative flex h-full flex-1 items-end outline-none"
          >
            {d.grams > 0 && (
              <div
                className="bg-primary group-hover:bg-primary/80 group-focus-visible:bg-primary/80 w-full rounded-t-[4px]"
                style={{ height: `max(2px, ${(d.grams / max) * 100}%)` }}
              />
            )}
            <div
              className={cn(
                "bg-popover text-popover-foreground pointer-events-none absolute z-10 hidden rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block group-focus-visible:block",
                i < 4 ? "left-0" : i > last - 4 ? "right-0" : "left-1/2 -translate-x-1/2",
              )}
              // Just above the bar, so it stays next to what it describes.
              style={{ bottom: `calc(${(d.grams / max) * 100}% + 4px)` }}
            >
              <div className="text-muted-foreground">{dayLabel(d.date)}</div>
              <div className="font-semibold tabular">{formatGrams(d.grams, { precise: true })}</div>
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-muted-foreground flex justify-between text-xs">
        <span>{dayLabel(days[0].date)}</span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
}
