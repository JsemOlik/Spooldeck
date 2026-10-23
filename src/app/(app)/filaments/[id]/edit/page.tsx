import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateFilamentAction } from "@/actions/filaments";
import { FilamentForm } from "@/components/filaments/filament-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { listBrands, listMaterials } from "@/db/queries/catalog";
import { intParam } from "@/lib/params";

export const metadata: Metadata = { title: "Edit filament" };

export default async function EditFilamentPage({ params }: PageProps<"/filaments/[id]/edit">) {
  const id = intParam((await params).id);
  if (!id) notFound();
  const [filament, brands, materials] = await Promise.all([
    db.query.filaments.findFirst({ where: (f, { eq }) => eq(f.id, id), with: { brand: true, material: true } }),
    listBrands(),
    listMaterials(),
  ]);
  if (!filament) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit filament" description={filament.name} />
      <FilamentForm
        action={updateFilamentAction.bind(null, filament.id)}
        defaults={{ ...filament, brandName: filament.brand?.name, materialName: filament.material?.name }}
        brands={brands.map((b) => b.name)}
        materials={materials}
        submitLabel="Save changes"
      />
    </div>
  );
}
