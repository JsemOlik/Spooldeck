"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatGrams } from "@/lib/format";
import { type SpoolChoice, spoolLabel } from "@/lib/spool-label";
import { cn } from "@/lib/utils";

type Tool = {
  tool: number;
  spool: SpoolChoice | null;
  /** Grams this tool has used in the current print. */
  grams: number | null;
  /** Extruding right now. */
  active: boolean;
};

/**
 * The printer's tools left to right, each showing the colour loaded on it, so they can be matched
 * to the printer at a glance. Clicking one picks its spool.
 */
export function ToolStrip({
  tools,
  spools,
  elsewhere = {},
  onLoad,
  disabled,
}: {
  tools: Tool[];
  spools: SpoolChoice[];
  /** Spools loaded on other printers, by id, with where they are ("Voron", "XL · T2"). */
  elsewhere?: Record<number, string>;
  onLoad: (tool: number, spoolId: number | null) => void;
  disabled?: boolean;
}) {
  return (
    // One row in the printer's own order, so it reads like the toolheads or slots themselves. The
    // tools share the width; only more than fit (a 16-slot MMU on a phone) scroll sideways.
    <ol
      className="-m-1 grid gap-1 overflow-x-auto p-1 sm:gap-2"
      style={{ gridTemplateColumns: `repeat(${tools.length}, minmax(2.25rem, 1fr))` }}
      aria-label="Tools"
    >
      {tools.map((t) => {
        // A spool can only be in one place, so the ones on the other tools are taken too.
        const taken = { ...elsewhere };
        for (const o of tools) if (o.spool && o.tool !== t.tool) taken[o.spool.id] = `T${o.tool + 1}`;
        return (
          <li key={t.tool} className="min-w-0">
            <ToolButton tool={t} spools={spools} taken={taken} onLoad={(id) => onLoad(t.tool, id)} disabled={disabled} />
          </li>
        );
      })}
    </ol>
  );
}

function ToolButton({
  tool,
  spools,
  taken,
  onLoad,
  disabled,
}: {
  tool: Tool;
  spools: SpoolChoice[];
  taken: Record<number, string>;
  onLoad: (spoolId: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = tool.spool;
  const label = `Tool ${tool.tool + 1}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${s ? spoolLabel(s) : "no spool loaded"}. Change spool`}
          className={cn(
            // A size container, so the swatch and text scale with the tile however many tools share the row.
            "@container hover:bg-muted/60 focus-visible:ring-ring/50 data-[state=open]:border-primary relative grid h-full w-full min-w-0 content-start justify-items-center gap-1.5 rounded-xl border px-0.5 pt-2 pb-2.5 text-center transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
            tool.active && "border-primary bg-primary/5",
          )}
        >
          <span className="flex items-center gap-1 text-xs font-semibold tabular">
            T{tool.tool + 1}
            {tool.active && <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />}
          </span>
          {s ? (
            <ColorSwatch hex={s.colorHex} title={s.colorName ?? undefined} className="size-[clamp(1.5rem,80cqi,3rem)]" />
          ) : (
            <span className="border-muted-foreground/40 text-muted-foreground flex size-[clamp(1.5rem,80cqi,3rem)] items-center justify-center rounded-full border-2 border-dashed">
              <PlusIcon className="size-[45%]" />
            </span>
          )}
          {/* Sized to the tile, so names fit whole words on a line. Tiles too narrow for any name
              (eight tools on a phone) show just the colour; the button's label still names it. */}
          <span
            lang="en"
            className={cn(
              "hidden w-full text-[clamp(0.625rem,24cqi,0.875rem)] leading-tight break-words hyphens-auto @[2.25rem]:line-clamp-2",
              s ? "font-medium" : "text-muted-foreground",
            )}
          >
            {s ? s.colorName || s.filamentName : "Empty"}
          </span>
          {s && (
            <span className="text-muted-foreground hidden w-full truncate text-[clamp(0.625rem,22cqi,0.75rem)] tabular @[2.25rem]:block">
              {tool.grams != null ? formatGrams(tool.grams, { precise: true }) : formatGrams(Math.max(0, s.remaining))}
              <span className="hidden @[6rem]:inline">{tool.grams != null ? " this print" : " left"}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      {/* Fits the room on screen (above the phone tab bar too), with the list scrolling inside. */}
      <PopoverContent
        align="start"
        collisionPadding={{ top: 8, bottom: 88, left: 8, right: 8 }}
        className="max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
      >
        <SpoolPicker
          title={label}
          spools={spools}
          taken={taken}
          value={s?.id ?? null}
          onPick={(id) => {
            setOpen(false);
            if (id !== (s?.id ?? null)) onLoad(id);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function SpoolPicker({
  title,
  spools,
  taken,
  value,
  onPick,
}: {
  title: string;
  spools: SpoolChoice[];
  taken: Record<number, string>;
  value: number | null;
  onPick: (spoolId: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const matches = q ? spools.filter((s) => spoolLabel(s).toLowerCase().includes(q)) : spools;
  // Spools loaded somewhere else go last, greyed out.
  const shown = [...matches.filter((s) => !taken[s.id]), ...matches.filter((s) => taken[s.id])];

  // Arrow keys move between the search box and the choices.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-pick]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? items[i + 1] : i > 0 ? items[i - 1] : null;
    e.preventDefault();
    if (next) next.focus();
    else if (e.key === "ArrowUp") list.current?.parentElement?.querySelector("input")?.focus();
  }

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Spool for ${title.toLowerCase()}…`}
          aria-label={`Search spools for ${title.toLowerCase()}`}
          className="placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div ref={list} className="grid max-h-72 min-h-0 flex-1 content-start overflow-y-auto p-1" role="listbox" aria-label={`Spools for ${title.toLowerCase()}`}>
        {!q && <PickItem selected={value === null} onPick={() => onPick(null)} label="No spool loaded" />}
        {shown.map((s) => (
          <PickItem key={s.id} selected={value === s.id} onPick={() => onPick(s.id)} spool={s} takenBy={taken[s.id]} />
        ))}
        {shown.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">No spools match.</p>}
      </div>
      {value && (
        <div className="shrink-0 border-t p-1">
          <Link href={`/spools/${value}`} className="text-primary hover:bg-muted block rounded-md px-2 py-1.5 text-sm">
            Open the loaded spool →
          </Link>
        </div>
      )}
    </div>
  );
}

function PickItem({
  selected,
  onPick,
  spool,
  label,
  takenBy,
}: {
  selected: boolean;
  onPick: () => void;
  spool?: SpoolChoice;
  label?: string;
  /** Where the spool is loaded, when it's already on another tool or printer. */
  takenBy?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={!!takenBy}
      disabled={!!takenBy}
      data-pick={takenBy ? undefined : ""}
      onClick={onPick}
      className="hover:bg-muted focus-visible:bg-muted flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none disabled:pointer-events-none disabled:opacity-45 disabled:grayscale"
    >
      {spool ? (
        <ColorSwatch hex={spool.colorHex} className="size-6" />
      ) : (
        <span className="border-muted-foreground/40 size-6 shrink-0 rounded-full border-2 border-dashed" />
      )}
      <span className="min-w-0 flex-1">
        {spool ? (
          <>
            <span className="block truncate text-sm font-medium">{spool.colorName || spool.filamentName}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {spool.colorName ? `${spool.filamentName} · ` : ""}
              {takenBy ? `On ${takenBy}` : `${formatGrams(Math.max(0, spool.remaining))} left · ${spool.code}`}
            </span>
          </>
        ) : (
          <span className="text-sm">{label}</span>
        )}
      </span>
      {selected && <CheckIcon className="text-primary size-4 shrink-0" />}
    </button>
  );
}
