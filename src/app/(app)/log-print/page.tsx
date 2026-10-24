import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PrintImport, type SpoolOption } from "@/components/prints/print-import";
import { listSpools } from "@/db/queries/spools";

export const metadata: Metadata = { title: "Log print" };

export default async function LogPrintPage() {
  const spools = await listSpools({ status: "active" });
  const options: SpoolOption[] = spools.map((s) => ({
    id: s.id,
    code: s.code,
    status: s.status,
    remaining: s.remaining,
    filamentName: s.filamentName,
    colorName: s.colorName,
    colorHex: s.colorHex,
    brandName: s.brandName,
    materialName: s.materialName,
    density: s.density,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Log print"
        description="Upload the G-code from PrusaSlicer and Spooldeck takes the filament it used off the right spools."
      />
      <PrintImport spools={options} />
    </div>
  );
}
