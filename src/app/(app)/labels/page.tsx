import type { Metadata } from "next";
import { LabelDesigner, type TemplateOption } from "@/components/labels/label-designer";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { getSpoolsForLabels, listSpools } from "@/db/queries/spools";
import { labelTemplates } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { DEFAULT_CONFIG, labelConfigSchema } from "@/lib/labels/config";
import { buildLabelData, buildPrinterLabelData, getPrintersForLabels, sampleLabelData, samplePrinterLabelData } from "@/lib/labels/data";
import { idListParam, intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Labels" };

export default async function LabelsPage({ searchParams }: PageProps<"/labels">) {
  const sp = await searchParams;
  // ?printers=1,2 opens the designer on printer labels; otherwise it's spools (?spools=…).
  const subject = sp.printers !== undefined ? "printers" : "spools";
  const selectedIds = idListParam(subject === "printers" ? sp.printers : sp.spools);
  const templateId = intParam(sp.template);

  const [rows, active, settings, baseUrl, printerRows] = await Promise.all([
    db.query.labelTemplates.findMany({ orderBy: labelTemplates.name }),
    listSpools({ status: "active", sort: "name" }),
    getAppSettings(),
    getBaseUrl(),
    getPrintersForLabels(),
  ]);

  // Selected spools first (they may be empty or archived), then everything in stock.
  const spoolIds = subject === "spools" ? selectedIds : [];
  const ids = [...new Set([...spoolIds, ...active.map((s) => s.id)])];
  const byId = new Map((await getSpoolsForLabels(ids)).map((s) => [s.id, s]));
  const [spools, printers, sample, printerSample] = await Promise.all([
    buildLabelData(
      ids.flatMap((id) => byId.get(id) ?? []),
      baseUrl,
      settings.currency,
    ),
    buildPrinterLabelData(printerRows, baseUrl),
    sampleLabelData(baseUrl),
    samplePrinterLabelData(baseUrl),
  ]);
  const known = new Set(subject === "spools" ? byId.keys() : printerRows.map((p) => p.id));

  const templates: TemplateOption[] = rows.flatMap((t) => {
    const config = labelConfigSchema.safeParse({ widthMm: t.widthMm, heightMm: t.heightMm, layout: t.layout, sheet: t.sheet });
    return config.success ? [{ id: t.id, name: t.name, isDefault: t.isDefault, config: config.data }] : [];
  });
  const initialTemplate = templates.find((t) => t.id === templateId) ?? templates.find((t) => t.isDefault) ?? null;

  return (
    <>
      <PageHeader
        title="Labels"
        description="Design a label, pick spools or printers and print. Scanning a label opens its spool or printer."
      />
      <LabelDesigner
        key={initialTemplate?.id ?? "new"}
        spools={spools}
        printers={printers}
        sample={sample}
        printerSample={printerSample}
        templates={templates}
        initialTemplateId={initialTemplate?.id ?? null}
        initialConfig={initialTemplate?.config ?? DEFAULT_CONFIG}
        initialSubject={subject}
        initialSelected={selectedIds.filter((id) => known.has(id))}
      />
    </>
  );
}
