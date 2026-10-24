"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterSelect = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Value used when the param is missing; shown as the first option. */
  allLabel?: string;
};

// Radix Select items can't have an empty value, so "no filter" gets its own.
const ALL = "__all";

export function ListFilters({
  selects,
  placeholder = "Search…",
}: {
  selects: FilterSelect[];
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    startTransition(() =>
      router.replace(`${pathname}?${next.toString()}`, { scroll: false }),
    );
  }

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = [...params.keys()].length > 0;

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-70",
      )}
    >
      <div className="relative min-w-48 flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Search"
        />
      </div>
      {selects.map((s) => {
        const value = params.get(s.name) || ALL;
        const allLabel = s.allLabel ?? `All ${s.label.toLowerCase()}`;
        return (
          <Select
            key={s.name}
            value={value}
            onValueChange={(v) => update(s.name, v === ALL ? "" : v)}
          >
            <SelectTrigger aria-label={s.label} className="min-w-32">
              {/* Explicit label so the server-rendered HTML isn't blank before hydration. */}
              <SelectValue>
                {s.options.find((o) => o.value === value)?.label ?? allLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={ALL}>{allLabel}</SelectItem>
              {s.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <XIcon />
          Clear
        </Button>
      )}
    </div>
  );
}
