import type { Metadata } from "next";
import { LabelDesigner, type TemplateOption } from "@/components/labels/label-designer";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { getSpoolsForLabels, listSpools } from "@/db/queries/spools";
import { labelTemplates } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { DEFAULT_CONFIG, labelConfigSchema } from "@/lib/labels/config";
import { buildLabelData, sampleLabelData } from "@/lib/labels/data";
import { idListParam, intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Labels" };

export default async function LabelsPage({ searchParams }: PageProps<"/labels">) {
  const sp = await searchParams;
  const selectedIds = idListParam(sp.spools);
  const templateId = intParam(sp.template);

  const [rows, active, settings, baseUrl] = await Promise.all([
    db.query.labelTemplates.findMany({ orderBy: labelTemplates.name }),
    listSpools({ status: "active", sort: "name" }),
    getAppSettings(),
    getBaseUrl(),
  ]);

  // Selected spools first (they may be empty or archived), then everything in stock.
  const ids = [...new Set([...selectedIds, ...active.map((s) => s.id)])];
  const byId = new Map((await getSpoolsForLabels(ids)).map((s) => [s.id, s]));
  const spools = await buildLabelData(
    ids.flatMap((id) => byId.get(id) ?? []),
    baseUrl,
    settings.currency,
  );

  const templates: TemplateOption[] = rows.flatMap((t) => {
    const config = labelConfigSchema.safeParse({ widthMm: t.widthMm, heightMm: t.heightMm, layout: t.layout, sheet: t.sheet });
    return config.success ? [{ id: t.id, name: t.name, isDefault: t.isDefault, config: config.data }] : [];
  });
  const initialTemplate = templates.find((t) => t.id === templateId) ?? templates.find((t) => t.isDefault) ?? null;

  return (
    <>
      <PageHeader
        title="Labels"
        description="Design a label, pick spools and print. Scanning a label opens its spool."
      />
      <LabelDesigner
        key={initialTemplate?.id ?? "new"}
        spools={spools}
        sample={await sampleLabelData(baseUrl)}
        templates={templates}
        initialTemplateId={initialTemplate?.id ?? null}
        initialConfig={initialTemplate?.config ?? DEFAULT_CONFIG}
        initialSelected={selectedIds.filter((id) => byId.has(id))}
        baseUrl={baseUrl}
      />
    </>
  );
}
