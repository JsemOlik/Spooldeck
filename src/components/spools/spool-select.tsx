"use client";

import { ColorSwatch } from "@/components/color-swatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SpoolChoice, spoolLabel } from "@/lib/spool-label";

export type { SpoolChoice };

// Radix Select items can't have an empty value.
const NONE = "none";

/** Picks one spool from a list, with colour swatches; `noneLabel` is the "no spool" choice. */
export function SpoolSelect({
  id,
  spools,
  value,
  onChange,
  noneLabel,
  disabled,
}: {
  id?: string;
  spools: SpoolChoice[];
  value: number | null;
  onChange: (spoolId: number | null) => void;
  noneLabel: string;
  disabled?: boolean;
}) {
  const selected = value ? spools.find((s) => s.id === value) : undefined;
  return (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
      <SelectTrigger id={id} className="w-full min-w-0">
        {/* Explicit label so the server-rendered HTML isn't blank before hydration. */}
        <SelectValue>
          {selected ? (
            <>
              <ColorSwatch hex={selected.colorHex} className="size-4" />
              <span className="truncate">{spoolLabel(selected)}</span>
            </>
          ) : (
            noneLabel
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" className="max-w-(--radix-select-content-available-width)">
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {spools.map((s) => (
          <SelectItem key={s.id} value={String(s.id)} className="*:[span]:last:min-w-0">
            <ColorSwatch hex={s.colorHex} className="size-4" />
            <span className="truncate">{spoolLabel(s)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
