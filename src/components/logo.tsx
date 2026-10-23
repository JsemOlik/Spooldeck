import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-[1.2em]", className)}>
      <circle cx="16" cy="16" r="14" fill="var(--primary)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" strokeDasharray="3 2.2" />
      <circle cx="16" cy="16" r="4" fill="var(--primary-foreground)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      Spooldeck
    </span>
  );
}
