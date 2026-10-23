import type { Metadata } from "next";
import { createFilamentAction } from "@/actions/filaments";
import { FilamentForm } from "@/components/filaments/filament-form";
import { PageHeader } from "@/components/page-header";
import { listBrands, listMaterials } from "@/db/queries/catalog";

export const metadata: Metadata = { title: "Add filament" };

export default async function NewFilamentPage() {
  const [brands, materials] = await Promise.all([listBrands(), listMaterials()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add filament" description="Describe the product once; then add as many spools of it as you own." />
      <FilamentForm
        action={createFilamentAction}
        brands={brands.map((b) => b.name)}
        materials={materials}
        submitLabel="Save filament"
        showThenSpool
      />
    </div>
  );
}
