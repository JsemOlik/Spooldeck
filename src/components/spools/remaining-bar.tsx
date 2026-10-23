import { cn } from "@/lib/utils";
import { remainingPercent } from "@/lib/weights";

export function RemainingBar({
  initial,
  remaining,
  low,
  className,
}: {
  initial: number;
  remaining: number;
  low?: boolean;
  className?: string;
}) {
  const pct = remainingPercent(initial, remaining);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={initial}
      aria-valuenow={Math.max(0, remaining)}
      aria-label="Remaining filament"
      className={cn("bg-muted h-1.5 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", low ? "bg-destructive" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
