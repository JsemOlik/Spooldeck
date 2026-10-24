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
  taken = {},
}: {
  id?: string;
  spools: SpoolChoice[];
  value: number | null;
  onChange: (spoolId: number | null) => void;
  noneLabel: string;
  disabled?: boolean;
  /** Spools that are already somewhere else, by id, with where; they're greyed out and can't be picked. */
  taken?: Record<number, string>;
}) {
  const ordered = [...spools.filter((s) => !taken[s.id]), ...spools.filter((s) => taken[s.id])];
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
        {ordered.map((s) => (
          <SelectItem
            key={s.id}
            value={String(s.id)}
            disabled={!!taken[s.id] && s.id !== value}
            className="*:[span]:last:min-w-0 data-disabled:grayscale"
          >
            <ColorSwatch hex={s.colorHex} className="size-4" />
            <span className="truncate">
              {spoolLabel(s)}
              {taken[s.id] && s.id !== value && ` · on ${taken[s.id]}`}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
