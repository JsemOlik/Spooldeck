import { PrinterIcon } from "lucide-react";
import type { PrinterMotion } from "@/db/schema";
import { MOTION_LABEL } from "@/lib/printers/motion";
import { cn } from "@/lib/utils";

/**
 * A line drawing of how the printer moves: a bedslinger's bed sliding under the gantry, or a CoreXY
 * box with the head on top and the bed dropping. The moving part is in the accent colour.
 */
export function MotionIcon({ motion, className }: { motion: PrinterMotion | null; className?: string }) {
  if (!motion) return <PrinterIcon className={cn("text-muted-foreground", className)} aria-hidden />;
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={MOTION_LABEL[motion]}
      className={className}
    >
      {motion === "bedslinger" ? (
        <>
          {/* Frame and the X gantry with the head on it. */}
          <path d="M14 46V8h36v38" />
          <path d="M14 21h36" />
          <rect x="26" y="16" width="12" height="11" rx="2" fill="var(--card, transparent)" />
          <path d="M30 27l2 3.5 2-3.5" />
          {/* The bed, which slides back and forth. */}
          <g className="text-primary" stroke="currentColor">
            <rect x="6" y="40" width="40" height="5" rx="1.5" fill="currentColor" fillOpacity={0.2} />
            <path d="M12 53h28M16 49.5L12 53l4 3.5M36 49.5l4 3.5-4 3.5" />
          </g>
        </>
      ) : (
        <>
          {/* The box, with the head on the gantry across its top. */}
          <rect x="8" y="6" width="48" height="52" rx="3" />
          <path d="M8 17h48" />
          <rect x="26" y="12" width="12" height="11" rx="2" fill="var(--card, transparent)" />
          <path d="M30 23l2 3.5 2-3.5" />
          {/* The bed, which moves down as the print grows. */}
          <g className="text-primary" stroke="currentColor">
            <rect x="15" y="33" width="34" height="5" rx="1.5" fill="currentColor" fillOpacity={0.2} />
            <path d="M32 42v10M28.5 48.5L32 52l3.5-3.5" />
          </g>
        </>
      )}
    </svg>
  );
}
