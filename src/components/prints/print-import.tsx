"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileUpIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { logPrintAction } from "@/actions/spools";
import { ColorSwatch } from "@/components/color-swatch";
import { Field, FormError } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGrams } from "@/lib/format";
import { DEFAULT_DENSITY, gramsFor, type SpoolCandidate, suggestSpools } from "@/lib/slicer/match";
import { parseSlicedFile, type SliceInfo, SlicerParseError } from "@/lib/slicer/parse";
import { cn } from "@/lib/utils";

export type SpoolOption = SpoolCandidate & { code: string };

type Row = { spoolId: number | null; grams: string; edited: boolean };

const ACCEPT = ".gcode,.bgcode,.gco,.g";
// Radix Select items can't have an empty value.
const SKIP = "skip";

function spoolLabel(s: SpoolOption) {
  const name = [s.brandName, s.filamentName].filter(Boolean).join(" ");
  const color = s.colorName && !name.toLowerCase().includes(s.colorName.toLowerCase()) ? ` · ${s.colorName}` : "";
  return `${name}${color} · ${formatGrams(s.remaining)} left · ${s.code}`;
}

const gramsText = (n: number | null) => (n == null ? "" : String(n));

export function PrintImport({ spools }: { spools: SpoolOption[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [info, setInfo] = useState<SliceInfo | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [printName, setPrintName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, startSaving] = useTransition();
  const byId = new Map(spools.map((s) => [s.id, s]));

  function reset() {
    setInfo(null);
    setFileName(null);
    setRows([]);
    setNote("");
    setError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File) {
    reset();
    setReading(true);
    try {
      const parsed = await parseSlicedFile(file, file.name);
      const suggestions = suggestSpools(parsed.filaments, spools);
      setInfo(parsed);
      setFileName(file.name);
      setPrintName(parsed.printName);
      setRows(
        parsed.filaments.map((f, i) => {
          const spoolId = suggestions[i];
          return { spoolId, grams: gramsText(gramsFor(f, spoolId ? byId.get(spoolId) : null)), edited: false };
        }),
      );
    } catch (e) {
      setError(e instanceof SlicerParseError ? e.message : "Couldn't read this file. Is it G-code from PrusaSlicer?");
    } finally {
      setReading(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, j) => {
        if (j !== i) return row;
        const next = { ...row, ...patch };
        // Grams estimated from volume depend on the spool's density, so follow the spool until edited.
        if ("spoolId" in patch && !row.edited && info) {
          next.grams = gramsText(gramsFor(info.filaments[i], next.spoolId ? byId.get(next.spoolId) : null));
        }
        return next;
      }),
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const usage = rows.flatMap((r) => (r.spoolId ? [{ spoolId: r.spoolId, grams: Number(r.grams) }] : []));
    if (!usage.length) {
      setError("Pick a spool for at least one filament.");
      return;
    }
    if (usage.some((u) => !(u.grams > 0))) {
      setError("Enter the grams used for each spool.");
      return;
    }
    startSaving(async () => {
      const result = await logPrintAction({ printName, note, usage });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      reset();
      setPrintName("");
    });
  }

  if (!spools.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="font-medium">No spools in stock</div>
          <p className="text-muted-foreground max-w-sm text-sm">Add the spools you print with first, then log prints against them.</p>
          <Button asChild>
            <Link href="/spools/new">Add spool</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void readFile(file);
      }}
    />
  );

  if (!info) {
    return (
      <div className="grid gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          className={cn(
            "hover:bg-muted/50 focus-within:border-primary flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
          )}
        >
          {fileInput}
          {reading ? <Loader2Icon className="text-muted-foreground size-10 animate-spin" /> : <FileUpIcon className="text-muted-foreground size-10" />}
          <div className="font-medium">{reading ? "Reading…" : "Drop a G-code file here, or tap to choose one"}</div>
          <p className="text-muted-foreground max-w-sm text-sm">
            Plain <code>.gcode</code> or binary <code>.bgcode</code> exported from PrusaSlicer. The file stays on this device; only the
            usage is sent.
          </p>
        </label>
        <FormError message={error} />
      </div>
    );
  }

  const multi = info.filaments.length > 1;
  return (
    <form onSubmit={save} className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{fileName}</div>
              <div className="text-muted-foreground text-xs">
                {[info.slicer, info.printTime && `${info.printTime} print`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Choose another file" onClick={reset}>
              <XIcon />
            </Button>
          </div>
          <Field label="Print name" htmlFor="printName">
            <Input id="printName" value={printName} maxLength={200} onChange={(e) => setPrintName(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {info.filaments.map((f, i) => {
        const row = rows[i];
        const spool = row.spoolId ? byId.get(row.spoolId) : undefined;
        const grams = Number(row.grams);
        const label = multi ? `Extruder ${f.index + 1}` : "Filament";
        return (
          <Card key={f.index} size="sm">
            <CardContent className="grid gap-3">
              <div className="flex items-center gap-3">
                <ColorSwatch hex={f.colorHex} className="size-7" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {label}
                    {f.type && <span className="text-muted-foreground font-normal"> · {f.type}</span>}
                  </div>
                  {f.profile && <div className="text-muted-foreground truncate text-xs">{f.profile}</div>}
                </div>
              </div>
              <div className="grid items-start gap-3 sm:grid-cols-[1fr_8rem]">
                <Field label="Spool" htmlFor={`spool-${i}`}>
                  <Select
                    value={row.spoolId ? String(row.spoolId) : SKIP}
                    onValueChange={(v) => updateRow(i, { spoolId: v === SKIP ? null : Number(v) })}
                  >
                    <SelectTrigger id={`spool-${i}`} className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-w-(--radix-select-content-available-width)">
                      <SelectItem value={SKIP}>Don&apos;t log this filament</SelectItem>
                      {spools.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)} className="*:[span]:last:min-w-0">
                          <ColorSwatch hex={s.colorHex} className="size-4" />
                          <span className="truncate">{spoolLabel(s)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Grams"
                  htmlFor={`grams-${i}`}
                  error={spool && grams > spool.remaining ? `Only ${formatGrams(spool.remaining)} left` : undefined}
                  hint={f.grams == null && !row.edited ? `Estimated at ${spool?.density ?? DEFAULT_DENSITY} g/cm³` : undefined}
                >
                  <Input
                    id={`grams-${i}`}
                    inputMode="decimal"
                    value={row.grams}
                    disabled={!row.spoolId}
                    onChange={(e) => updateRow(i, { grams: e.target.value, edited: true })}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Field label="Note" htmlFor="note">
        <Input id="note" value={note} maxLength={2000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={reset}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving || !rows.some((r) => r.spoolId)}>
          {saving && <Loader2Icon className="animate-spin" />}
          Log print
        </Button>
      </div>
    </form>
  );
}
