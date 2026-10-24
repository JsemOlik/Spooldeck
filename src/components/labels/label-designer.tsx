"use client";

import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { PrinterIcon, SaveIcon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  deleteLabelTemplateAction,
  saveLabelTemplateAction,
  setDefaultLabelTemplateAction,
} from "@/actions/labels";
import { ColorSwatch } from "@/components/color-swatch";
import { Field } from "@/components/forms/field";
import { LabelView } from "@/components/labels/label-view";
import { MotionIcon } from "@/components/printers/motion-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  encodeConfig,
  LABEL_FIELD_LABELS,
  LABEL_FIELDS,
  LABEL_PRESETS,
  PAGE_SIZES_MM,
  PRINTER_LABEL_FIELD_LABELS,
  PRINTER_LABEL_FIELDS,
  type LabelConfig,
  type LabelField,
  type LabelLayout,
  type LabelSubject,
  type PrinterLabelField,
  type SheetLayout,
} from "@/lib/labels/config";
import type { PrinterLabelData, SpoolLabelData } from "@/lib/labels/data";

export type TemplateOption = { id: number; name: string; isDefault: boolean; config: LabelConfig };

const MM_TO_PX = 96 / 25.4;
/** Select value for "not a saved template" (Radix Select items can't be empty). */
const NEW_TEMPLATE = "new";

const PAGE_LABELS: Record<SheetLayout["page"], string> = { A4: "A4 (210 × 297 mm)", Letter: "Letter (8.5 × 11 in)" };
const QR_POSITION_LABELS: Record<LabelLayout["qrPosition"], string> = {
  left: "Left",
  right: "Right",
  top: "Top",
  none: "No QR code",
};

const templateLabel = (t?: { name: string; isDefault: boolean }) => (t ? `${t.name}${t.isDefault ? " (default)" : ""}` : "New template");

export function LabelDesigner({
  spools,
  printers,
  sample,
  printerSample,
  templates,
  initialTemplateId,
  initialConfig,
  initialSubject,
  initialSelected,
}: {
  spools: SpoolLabelData[];
  printers: PrinterLabelData[];
  sample: SpoolLabelData;
  printerSample: PrinterLabelData;
  templates: TemplateOption[];
  initialTemplateId: number | null;
  initialConfig: LabelConfig;
  initialSubject: LabelSubject;
  /** Spools or printers (whichever initialSubject is) to start with selected. */
  initialSelected: number[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [templateName, setTemplateName] = useState(templates.find((t) => t.id === initialTemplateId)?.name ?? "");
  const [subject, setSubject] = useState(initialSubject);
  // Each kind keeps its own selection, so switching back and forth doesn't lose it.
  const [selection, setSelection] = useState<Record<LabelSubject, number[]>>({
    spools: initialSubject === "spools" ? initialSelected : [],
    printers: initialSubject === "printers" ? initialSelected : [],
  });
  const selected = selection[subject];
  const setSelected = (ids: number[]) => setSelection((s) => ({ ...s, [subject]: ids }));
  const [copies, setCopies] = useState(1);
  const [skipRaw, setSkip] = useState(0);
  const [saving, startSaving] = useTransition();

  const layout = config.layout;
  const setLayout = (patch: Partial<LabelLayout>) => setConfig((c) => ({ ...c, layout: { ...c.layout, ...patch } }));
  const setSheet = (patch: Partial<SheetLayout>) =>
    setConfig((c) => (c.sheet ? { ...c, sheet: { ...c.sheet, ...patch } } : c));

  const presetId =
    LABEL_PRESETS.find(
      (p) =>
        p.widthMm === config.widthMm &&
        p.heightMm === config.heightMm &&
        !!p.sheet === !!config.sheet &&
        (!p.sheet || (p.sheet.page === config.sheet?.page && p.sheet.cols === config.sheet.cols && p.sheet.rows === config.sheet.rows)),
    )?.id ?? "custom";

  function applyPreset(id: string) {
    const preset = LABEL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setConfig((c) => ({ ...c, widthMm: preset.widthMm, heightMm: preset.heightMm, sheet: preset.sheet ?? null }));
    setSkip(0);
  }

  function toggleSheet(on: boolean) {
    setSkip(0);
    setConfig((c) => {
      if (!on) return { ...c, sheet: null };
      const [pw, ph] = PAGE_SIZES_MM.A4;
      return {
        ...c,
        sheet: {
          page: "A4",
          cols: Math.max(1, Math.min(10, Math.floor(pw / c.widthMm))),
          rows: Math.max(1, Math.min(40, Math.floor(ph / c.heightMm))),
          marginTopMm: 0,
          marginLeftMm: 0,
          gapXMm: 0,
          gapYMm: 0,
        },
      };
    });
  }

  function toggleField(field: LabelField, on: boolean) {
    setLayout({ fields: on ? LABEL_FIELDS.filter((f) => f === field || layout.fields.includes(f)) : layout.fields.filter((f) => f !== field) });
  }

  function togglePrinterField(field: PrinterLabelField, on: boolean) {
    const fields = layout.printerFields;
    setLayout({ printerFields: on ? PRINTER_LABEL_FIELDS.filter((f) => f === field || fields.includes(f)) : fields.filter((f) => f !== field) });
  }

  function loadTemplate(value: string) {
    const t = templates.find((x) => String(x.id) === value);
    if (!t) {
      setTemplateId(null);
      setTemplateName("");
      return;
    }
    setTemplateId(t.id);
    setTemplateName(t.name);
    setConfig(t.config);
    setSkip(0);
  }

  function save(asNew: boolean) {
    startSaving(async () => {
      const result = await saveLabelTemplateAction(asNew ? null : templateId, templateName, config);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTemplateId(result.id ?? null);
      toast.success("Template saved");
    });
  }

  function remove() {
    if (!templateId || !confirm(`Delete template “${templateName}”?`)) return;
    startSaving(async () => {
      await deleteLabelTemplateAction(templateId);
      setTemplateId(null);
      setTemplateName("");
      toast.success("Template deleted");
    });
  }

  function makeDefault() {
    if (!templateId) return;
    startSaving(async () => {
      await setDefaultLabelTemplateAction(templateId);
      toast.success("Default template set");
    });
  }

  const cells = config.sheet ? config.sheet.cols * config.sheet.rows : 1;
  const skip = config.sheet ? Math.min(skipRaw, cells - 1) : 0;
  const labelCount = selected.length * copies;
  const pageCount = config.sheet ? Math.ceil((skip + labelCount) / cells) : labelCount;
  const sheetFits = config.sheet ? sheetOverflow(config) : null;

  const previewData =
    subject === "spools" ? (spools.find((s) => s.id === selected[0]) ?? sample) : (printers.find((p) => p.id === selected[0]) ?? printerSample);
  const isSample = previewData === sample || previewData === printerSample;
  const printHref = `/labels/print?${new URLSearchParams({
    c: encodeConfig(config),
    auto: "1",
    [subject]: selected.join(","),
    ...(copies > 1 ? { copies: String(copies) } : {}),
    ...(skip > 0 ? { skip: String(skip) } : {}),
  })}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid grid-cols-1 content-start gap-6">
        <Tabs value={subject} onValueChange={(v) => setSubject(v as LabelSubject)}>
          <TabsList className="w-full sm:w-fit" aria-label="What to label">
            <TabsTrigger value="spools" className="sm:px-4">
              Spools
            </TabsTrigger>
            <TabsTrigger value="printers" className="sm:px-4">
              Printers
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <LabelPreview data={previewData} config={config} />
            <p className="text-muted-foreground text-center text-xs">
              {config.widthMm} × {config.heightMm} mm ·{" "}
              {isSample ? "sample data" : previewData.kind === "spool" ? `spool #${previewData.code}` : previewData.name} · QR opens{" "}
              <span className="font-mono break-all">{previewData.url}</span>
            </p>
            {config.sheet && (
              <SheetPreview config={config} skip={skip} count={labelCount} onPickSkip={(n) => setSkip(Math.min(n, cells - 1))} />
            )}
            {sheetFits && <p className="text-destructive text-center text-sm">{sheetFits}</p>}
          </CardContent>
        </Card>

        {subject === "spools" ? (
          <SpoolPicker spools={spools} selected={selected} onChange={setSelected} />
        ) : (
          <PrinterPicker printers={printers} selected={selected} onChange={setSelected} />
        )}
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Print</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Copies each" value={copies} min={1} max={50} step={1} onChange={setCopies} />
              {config.sheet && (
                <NumberField
                  label="Skip cells"
                  value={skip}
                  min={0}
                  max={cells - 1}
                  step={1}
                  onChange={setSkip}
                  hint="Already used stickers"
                />
              )}
            </div>
            {labelCount > 0 ? (
              <Button asChild size="lg">
                <a href={printHref} target="_blank" rel="noopener">
                  <PrinterIcon />
                  Print {labelCount} label{labelCount === 1 ? "" : "s"}
                </a>
              </Button>
            ) : (
              <Button size="lg" disabled>
                <PrinterIcon />
                Select {subject} to print
              </Button>
            )}
            {labelCount > 0 && (
              <p className="text-muted-foreground text-xs">
                {pageCount} page{pageCount === 1 ? "" : "s"}. In the print dialog set margins to <b>None</b> and scale to{" "}
                <b>100%</b>
                {config.sheet ? "." : `; for a label printer pick the ${config.widthMm} × ${config.heightMm} mm paper size.`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Size</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Preset" htmlFor="preset">
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger id="preset" className="w-full">
                  <SelectValue>{LABEL_PRESETS.find((p) => p.id === presetId)?.name ?? "Custom"}</SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  {presetId === "custom" && <SelectItem value="custom">Custom</SelectItem>}
                  {Object.entries(Object.groupBy(LABEL_PRESETS, (p) => p.group)).map(([group, presets]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {presets!.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Width"
                suffix="mm"
                value={config.widthMm}
                min={10}
                max={300}
                step={0.1}
                onChange={(widthMm) => setConfig((c) => ({ ...c, widthMm }))}
              />
              <NumberField
                label="Height"
                suffix="mm"
                value={config.heightMm}
                min={8}
                max={300}
                step={0.1}
                onChange={(heightMm) => setConfig((c) => ({ ...c, heightMm }))}
              />
            </div>
            <SwitchRow id="sheet" label="Sticker sheet (A4 / Letter)" checked={!!config.sheet} onChange={toggleSheet} />
            {config.sheet && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Page" htmlFor="page" className="col-span-2">
                  <Select value={config.sheet.page} onValueChange={(page) => setSheet({ page: page as SheetLayout["page"] })}>
                    <SelectTrigger id="page" className="w-full">
                      <SelectValue>{PAGE_LABELS[config.sheet.page]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.entries(PAGE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <NumberField label="Columns" value={config.sheet.cols} min={1} max={10} step={1} onChange={(cols) => setSheet({ cols })} />
                <NumberField label="Rows" value={config.sheet.rows} min={1} max={40} step={1} onChange={(rows) => setSheet({ rows })} />
                <NumberField
                  label="Top margin"
                  suffix="mm"
                  value={config.sheet.marginTopMm}
                  min={0}
                  max={100}
                  step={0.05}
                  onChange={(marginTopMm) => setSheet({ marginTopMm })}
                />
                <NumberField
                  label="Left margin"
                  suffix="mm"
                  value={config.sheet.marginLeftMm}
                  min={0}
                  max={100}
                  step={0.05}
                  onChange={(marginLeftMm) => setSheet({ marginLeftMm })}
                />
                <NumberField
                  label="Column gap"
                  suffix="mm"
                  value={config.sheet.gapXMm}
                  min={0}
                  max={50}
                  step={0.05}
                  onChange={(gapXMm) => setSheet({ gapXMm })}
                />
                <NumberField
                  label="Row gap"
                  suffix="mm"
                  value={config.sheet.gapYMm}
                  min={0}
                  max={50}
                  step={0.05}
                  onChange={(gapYMm) => setSheet({ gapYMm })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="QR code" htmlFor="qr">
              <Select value={layout.qrPosition} onValueChange={(qrPosition) => setLayout({ qrPosition: qrPosition as LabelLayout["qrPosition"] })}>
                <SelectTrigger id="qr" className="w-full">
                  <SelectValue>{QR_POSITION_LABELS[layout.qrPosition]}</SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.entries(QR_POSITION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {layout.qrPosition !== "none" && (
              <RangeField label="QR size" value={layout.qrScale} min={0.3} max={1} onChange={(qrScale) => setLayout({ qrScale })} />
            )}
            <RangeField label="Text size" value={layout.fontScale} min={0.5} max={2} onChange={(fontScale) => setLayout({ fontScale })} />
            <NumberField
              label="Padding"
              suffix="mm"
              value={layout.paddingMm}
              min={0}
              max={10}
              step={0.5}
              onChange={(paddingMm) => setLayout({ paddingMm })}
            />
            {/* Printers have no colour of their own. */}
            {subject === "spools" && (
              <>
                <SwitchRow id="bar" label="Color bar" checked={layout.colorBar} onChange={(colorBar) => setLayout({ colorBar })} />
                <SwitchRow id="swatch" label="Color dot by the name" checked={layout.swatch} onChange={(swatch) => setLayout({ swatch })} />
                <SwitchRow id="band" label="Color strip on the edge" checked={layout.colorBand} onChange={(colorBand) => setLayout({ colorBand })} />
              </>
            )}
            {layout.qrPosition !== "none" && (
              <SwitchRow id="logo" label="Logo in the QR code" checked={layout.qrLogo} onChange={(qrLogo) => setLayout({ qrLogo })} />
            )}
            <SwitchRow id="border" label="Border (cut guide)" checked={layout.border} onChange={(border) => setLayout({ border })} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{subject === "spools" ? "Fields" : "Fields besides the name"}</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {subject === "spools"
                  ? LABEL_FIELDS.map((f) => (
                      <label key={f} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={layout.fields.includes(f)} onCheckedChange={(v) => toggleField(f, v === true)} />
                        {LABEL_FIELD_LABELS[f]}
                      </label>
                    ))
                  : PRINTER_LABEL_FIELDS.map((f) => (
                      <label key={f} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={layout.printerFields.includes(f)} onCheckedChange={(v) => togglePrinterField(f, v === true)} />
                        {PRINTER_LABEL_FIELD_LABELS[f]}
                      </label>
                    ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {templates.length > 0 && (
              <Field label="Load" htmlFor="template">
                <Select value={templateId != null ? String(templateId) : NEW_TEMPLATE} onValueChange={loadTemplate}>
                  <SelectTrigger id="template" className="w-full">
                    <SelectValue>{templateLabel(templates.find((t) => t.id === templateId))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={NEW_TEMPLATE}>New template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {templateLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Name" htmlFor="template-name">
              <Input
                id="template-name"
                value={templateName}
                maxLength={100}
                placeholder="e.g. Box label 50×30"
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => save(false)} disabled={saving}>
                <SaveIcon />
                {templateId ? "Save" : "Save template"}
              </Button>
              {templateId && (
                <>
                  <Button type="button" variant="outline" onClick={() => save(true)} disabled={saving}>
                    Save as new
                  </Button>
                  {!templates.find((t) => t.id === templateId)?.isDefault && (
                    <Button type="button" variant="outline" onClick={makeDefault} disabled={saving}>
                      <StarIcon />
                      Make default
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={remove} disabled={saving} aria-label="Delete template">
                    <Trash2Icon />
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function sheetOverflow({ widthMm, heightMm, sheet }: LabelConfig) {
  if (!sheet) return null;
  const [pw, ph] = PAGE_SIZES_MM[sheet.page];
  const usedW = sheet.marginLeftMm + sheet.cols * widthMm + (sheet.cols - 1) * sheet.gapXMm;
  const usedH = sheet.marginTopMm + sheet.rows * heightMm + (sheet.rows - 1) * sheet.gapYMm;
  if (usedW > pw + 0.5 || usedH > ph + 0.5) {
    return `The grid is ${usedW.toFixed(1)} × ${usedH.toFixed(1)} mm, larger than the ${sheet.page} page (${pw} × ${ph} mm).`;
  }
  return null;
}

function LabelPreview({ data, config }: { data: SpoolLabelData | PrinterLabelData; config: LabelConfig }) {
  const wPx = config.widthMm * MM_TO_PX;
  const hPx = config.heightMm * MM_TO_PX;
  // As large as the card allows, so small labels can be read.
  const [room, setRoom] = useState(480);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(4, Math.min(room, 520) / wPx, 320 / hPx);
  return (
    <div className="bg-muted/60 rounded-lg p-4 sm:p-6">
      <div ref={ref} className="flex justify-center">
        <div className="shadow-md" style={{ width: wPx * scale, height: hPx * scale }} data-testid="label-preview">
          <div style={{ width: wPx, height: hPx, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <LabelView data={data} config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetPreview({
  config,
  skip,
  count,
  onPickSkip,
}: {
  config: LabelConfig;
  skip: number;
  count: number;
  onPickSkip: (n: number) => void;
}) {
  const sheet = config.sheet!;
  const [pw, ph] = PAGE_SIZES_MM[sheet.page];
  return (
    <div className="grid justify-items-center gap-1">
      <svg viewBox={`0 0 ${pw} ${ph}`} className="h-56 w-auto rounded-sm border bg-white" role="img" aria-label="First sheet">
        {Array.from({ length: sheet.cols * sheet.rows }, (_, i) => {
          const col = i % sheet.cols;
          const row = Math.floor(i / sheet.cols);
          const state = i < skip ? "skip" : i < skip + count ? "label" : "empty";
          return (
            <rect
              key={i}
              x={sheet.marginLeftMm + col * (config.widthMm + sheet.gapXMm)}
              y={sheet.marginTopMm + row * (config.heightMm + sheet.gapYMm)}
              width={config.widthMm}
              height={config.heightMm}
              rx={1.5}
              className="cursor-pointer"
              fill={state === "label" ? "#18181b" : state === "skip" ? "#e4e4e7" : "#fff"}
              stroke="#a1a1aa"
              strokeWidth={0.4}
              onClick={() => onPickSkip(i)}
            >
              <title>{state === "skip" ? "Skipped" : `Cell ${i + 1}: click to start here`}</title>
            </rect>
          );
        })}
      </svg>
      <p className="text-muted-foreground text-xs">Click a cell to start printing there.</p>
    </div>
  );
}

function SpoolPicker({
  spools,
  selected,
  onChange,
}: {
  spools: SpoolLabelData[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () =>
      q
        ? spools.filter((s) =>
            [s.code, s.values.brand, s.values.material, s.values.colorName, s.values.filamentName, s.values.location]
              .join(" ")
              .toLowerCase()
              .includes(q),
          )
        : spools,
    [spools, q],
  );
  const selectedSet = new Set(selected);
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selectedSet.has(s.id));

  function toggle(id: number, on: boolean) {
    onChange(on ? spools.filter((s) => s.id === id || selectedSet.has(s.id)).map((s) => s.id) : selected.filter((x) => x !== id));
  }

  function toggleVisible() {
    const ids = new Set(visible.map((s) => s.id));
    onChange(
      allVisibleSelected
        ? selected.filter((id) => !ids.has(id))
        : spools.filter((s) => ids.has(s.id) || selectedSet.has(s.id)).map((s) => s.id),
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Spools <span className="text-muted-foreground font-normal">({selected.length} selected)</span>
        </CardTitle>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={toggleVisible} disabled={visible.length === 0}>
            {allVisibleSelected ? "Deselect shown" : "Select shown"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {spools.length === 0 ? (
          <p className="text-muted-foreground text-sm">No spools in stock yet. Add a spool to print its label.</p>
        ) : (
          <>
            <Input
              type="search"
              placeholder="Filter by color, brand, code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter spools"
            />
            <ul className="divide-border max-h-96 divide-y overflow-y-auto rounded-lg border">
              {visible.map((s) => (
                <li key={s.id}>
                  <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2">
                    <Checkbox checked={selectedSet.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                    <ColorSwatch hex={s.colorHex} className="size-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.values.colorName ?? s.values.filamentName}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {[s.values.brand, s.values.material, s.values.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">#{s.code}</span>
                  </label>
                </li>
              ))}
              {visible.length === 0 && <li className="text-muted-foreground px-3 py-6 text-center text-sm">No matches.</li>}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrinterPicker({
  printers,
  selected,
  onChange,
}: {
  printers: PrinterLabelData[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const selectedSet = new Set(selected);
  const allSelected = printers.length > 0 && printers.every((p) => selectedSet.has(p.id));

  function toggle(id: number, on: boolean) {
    onChange(on ? printers.filter((p) => p.id === id || selectedSet.has(p.id)).map((p) => p.id) : selected.filter((x) => x !== id));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Printers <span className="text-muted-foreground font-normal">({selected.length} selected)</span>
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(allSelected ? [] : printers.map((p) => p.id))}
          disabled={printers.length === 0}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </CardHeader>
      <CardContent>
        {printers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No printers yet. Add one on the Printers page to print its label.</p>
        ) : (
          <ul className="divide-border max-h-96 divide-y overflow-y-auto rounded-lg border">
            {printers.map((p) => (
              <li key={p.id}>
                <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2">
                  <Checkbox checked={selectedSet.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
                  <MotionIcon motion={p.motion} className="text-muted-foreground size-6 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[[p.values.brand, p.values.model].filter(Boolean).join(" "), p.values.motion, p.values.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = `range-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full"
      />
    </div>
  );
}

/** Number input that lets you type freely and only reports values inside [min, max]. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const id = `num-${label.toLowerCase().replace(/\W+/g, "-")}`;
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(value));
  }
  const n = Number(draft);
  const invalid = draft === "" || !Number.isFinite(n) || n < min || n > max;
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} htmlFor={id} hint={hint} error={invalid ? `${min}–${max}` : undefined}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(next) && next >= min && next <= max) {
            setShown(next);
            onChange(next);
          }
        }}
        onBlur={() => invalid && setDraft(String(value))}
      />
    </Field>
  );
}
