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
  onLoad,
  disabled,
}: {
  tools: Tool[];
  spools: SpoolChoice[];
  onLoad: (tool: number, spoolId: number | null) => void;
  disabled?: boolean;
}) {
  return (
    // One row in the printer's own order, so it reads like the toolheads or slots themselves;
    // more tools than fit scroll sideways rather than wrapping onto a second row.
    <ol className="-mx-1 grid auto-cols-[minmax(3.5rem,1fr)] grid-flow-col gap-1.5 overflow-x-auto px-1 pb-1 sm:gap-2" aria-label="Tools">
      {tools.map((t) => (
        <li key={t.tool} className="min-w-0">
          <ToolButton tool={t} spools={spools} onLoad={(id) => onLoad(t.tool, id)} disabled={disabled} />
        </li>
      ))}
    </ol>
  );
}

function ToolButton({
  tool,
  spools,
  onLoad,
  disabled,
}: {
  tool: Tool;
  spools: SpoolChoice[];
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
            "hover:bg-muted/60 focus-visible:ring-ring/50 data-[state=open]:border-primary relative grid h-full w-full min-w-0 content-start justify-items-center gap-1.5 rounded-xl border px-1.5 pt-2 pb-2.5 text-center transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
            tool.active && "border-primary bg-primary/5",
          )}
        >
          <span className="flex items-center gap-1 text-xs font-semibold tabular">
            T{tool.tool + 1}
            {tool.active && <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />}
          </span>
          {s ? (
            <ColorSwatch hex={s.colorHex} title={s.colorName ?? undefined} className="size-10 sm:size-12" />
          ) : (
            <span className="border-muted-foreground/40 text-muted-foreground flex size-10 items-center justify-center rounded-full border-2 border-dashed sm:size-12">
              <PlusIcon className="size-5" />
            </span>
          )}
          <span className={cn("line-clamp-2 w-full text-xs leading-tight break-words sm:text-sm", s ? "font-medium" : "text-muted-foreground")}>
            {s ? s.colorName || s.filamentName : "Empty"}
          </span>
          {s && (
            <span className="text-muted-foreground w-full truncate text-[11px] tabular sm:text-xs">
              {tool.grams != null ? formatGrams(tool.grams, { precise: true }) : formatGrams(Math.max(0, s.remaining))}
              <span className="hidden sm:inline">{tool.grams != null ? " this print" : " left"}</span>
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
  value,
  onPick,
}: {
  title: string;
  spools: SpoolChoice[];
  value: number | null;
  onPick: (spoolId: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? spools.filter((s) => spoolLabel(s).toLowerCase().includes(q)) : spools;

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
          <PickItem key={s.id} selected={value === s.id} onPick={() => onPick(s.id)} spool={s} />
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

function PickItem({ selected, onPick, spool, label }: { selected: boolean; onPick: () => void; spool?: SpoolChoice; label?: string }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-pick
      onClick={onPick}
      className="hover:bg-muted focus-visible:bg-muted flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none"
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
              {formatGrams(Math.max(0, spool.remaining))} left · {spool.code}
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
