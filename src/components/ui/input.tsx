"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * Keeps only what a number field can hold: digits, plus one decimal point for
 * inputMode="decimal". A typed comma becomes a point so the server can parse it.
 */
function sanitizeNumber(value: string, decimal: boolean) {
  if (!decimal) return value.replace(/\D/g, "")
  let seenPoint = false
  return [...value.replace(/,/g, ".")]
    .filter((c) => (c === "." ? !seenPoint && (seenPoint = true) : c >= "0" && c <= "9"))
    .join("")
}

function Input({ className, type, onChange, ...props }: React.ComponentProps<"input">) {
  const numeric = (props.inputMode === "numeric" || props.inputMode === "decimal") && (type ?? "text") === "text"
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      onChange={
        numeric
          ? (e) => {
              // Sanitising on change covers typing, pasting and autofill, for controlled and uncontrolled inputs alike.
              const clean = sanitizeNumber(e.target.value, props.inputMode === "decimal")
              if (clean !== e.target.value) e.target.value = clean
              onChange?.(e)
            }
          : onChange
      }
      {...props}
    />
  )
}

export { Input }
