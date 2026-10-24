import type { Metadata } from "next";
import { LabelView } from "@/components/labels/label-view";
import { PrintToolbar } from "@/components/labels/print-toolbar";
import { getSpoolsForLabels } from "@/db/queries/spools";
import { requireUser } from "@/lib/auth/dal";
import { getBaseUrl } from "@/lib/base-url";
import { decodeConfig, PAGE_SIZES_MM, sheetGeometry, type LabelConfig } from "@/lib/labels/config";
import { buildLabelData, buildPrinterLabelData, getPrintersForLabels, type LabelData } from "@/lib/labels/data";
import { idListParam, intParam } from "@/lib/params";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Print labels" };

export default async function PrintLabelsPage({ searchParams }: PageProps<"/labels/print">) {
  await requireUser();
  const sp = await searchParams;
  const config = decodeConfig(Array.isArray(sp.c) ? sp.c[0] : sp.c);
  const ids = idListParam(sp.spools);
  const printerIds = idListParam(sp.printers);
  const copies = Math.min(intParam(sp.copies) ?? 1, 50);
  const skip = intParam(sp.skip) ?? 0;

  if (!config || ids.length + printerIds.length === 0) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Nothing to print</h1>
        <p className="text-muted-foreground mt-2 text-sm">Open the label designer, select spools or printers and press Print.</p>
        <a href="/labels" className="text-primary mt-4 inline-block text-sm hover:underline">
          Go to labels
        </a>
      </main>
    );
  }

  const [rows, printers, baseUrl, settings] = await Promise.all([
    getSpoolsForLabels(ids),
    getPrintersForLabels(printerIds),
    getBaseUrl(),
    getAppSettings(),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const data: LabelData[] = [
    ...(await buildLabelData(
      ids.flatMap((id) => byId.get(id) ?? []),
      baseUrl,
      settings.currency,
    )),
    ...(await buildPrinterLabelData(printers, baseUrl)),
  ];
  const labels = data.flatMap((d) => Array.from({ length: copies }, () => d));

  const { widthMm: w, heightMm: h, sheet } = config;
  const [pageW, pageH] = sheet ? PAGE_SIZES_MM[sheet.page] : [w, h];
  const pageCss = `
    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .print-screen { padding: 0 !important; gap: 0 !important; background: none !important; }
      .print-page { box-shadow: none !important; break-after: page; }
      .print-page:last-child { break-after: auto; }
    }
  `;

  return (
    <>
      <style>{pageCss}</style>
      <PrintToolbar
        count={labels.length}
        pages={sheet ? Math.ceil((skip + labels.length) / (sheet.cols * sheet.rows)) : labels.length}
        paper={sheet ? sheet.page : `${w} × ${h} mm`}
        autoPrint={sp.auto === "1"}
      />
      <main className="print-screen bg-muted flex min-h-dvh flex-col items-center gap-6 p-6">
        {sheet ? (
          <SheetPages labels={labels} config={config} skip={skip} pageW={pageW} pageH={pageH} />
        ) : (
          labels.map((label, i) => (
            <div key={i} className="print-page overflow-hidden bg-white shadow-md" style={{ width: `${w}mm`, height: `${h}mm` }}>
              <LabelView data={label} config={config} />
            </div>
          ))
        )}
      </main>
    </>
  );
}

function SheetPages({
  labels,
  config,
  skip,
  pageW,
  pageH,
}: {
  labels: LabelData[];
  config: LabelConfig;
  skip: number;
  pageW: number;
  pageH: number;
}) {
  const sheet = config.sheet!;
  const geo = sheetGeometry({ ...config, sheet });
  const perPage = sheet.cols * sheet.rows;
  const start = Math.min(skip, perPage - 1);
  const slots: (LabelData | null)[] = [...Array<null>(start).fill(null), ...labels];
  const pages = Array.from({ length: Math.ceil(slots.length / perPage) }, (_, p) => slots.slice(p * perPage, (p + 1) * perPage));
  // The page draws the cut guides instead of each label, so an edge two labels share is one line,
  // as thick as every other.
  const cutGuides = config.layout.border;
  const labelConfig = cutGuides ? { ...config, layout: { ...config.layout, border: false } } : config;

  return pages.map((page, p) => (
    <div
      key={p}
      className="print-page relative overflow-hidden bg-white shadow-md"
      style={{ width: `${pageW}mm`, height: `${pageH}mm` }}
    >
      {page.map((label, i) => {
        if (!label) return null;
        const { x, y } = geo.cell(i);
        return (
          <div key={i} className="absolute" style={{ left: `${x}mm`, top: `${y}mm`, width: `${geo.labelW}mm`, height: `${geo.labelH}mm` }}>
            <div style={geo.scale < 1 ? { transform: `scale(${geo.scale})`, transformOrigin: "top left" } : undefined}>
              <LabelView data={label} config={labelConfig} />
            </div>
          </div>
        );
      })}
      {cutGuides && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={`${pageW}mm`}
          height={`${pageH}mm`}
          viewBox={`0 0 ${pageW} ${pageH}`}
        >
          {/* Centred on the cut, so where two labels meet their strokes land on the same line. */}
          {page.map((label, i) => {
            if (!label) return null;
            const { x, y } = geo.cell(i);
            return <rect key={i} x={x} y={y} width={geo.labelW} height={geo.labelH} fill="none" stroke="#000" strokeWidth={0.3} />;
          })}
        </svg>
      )}
    </div>
  ));
}
