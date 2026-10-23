import { cn } from "@/lib/utils";

/** A filament-coloured disc with a spool hub, used everywhere a colour is shown. */
export function ColorSwatch({ hex, className, title }: { hex?: string | null; className?: string; title?: string }) {
  const color = hex ?? "transparent";
  return (
    <span
      title={title ?? hex ?? undefined}
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15",
        !hex && "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_4px,transparent_4px,transparent_8px)]",
        className,
      )}
      style={hex ? { backgroundColor: color } : undefined}
    >
      <span className="bg-background/90 size-[32%] rounded-full ring-1 ring-black/10 dark:ring-white/10" />
    </span>
  );
}
