"use client";

import { useActionState, useState } from "react";
import { ColorField } from "@/components/forms/color-field";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Filament, Material } from "@/db/schema";
import { type ActionState, initialActionState } from "@/lib/action-state";

export type FilamentFormDefaults = Partial<Filament> & { brandName?: string | null; materialName?: string | null };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: FilamentFormDefaults;
  brands: string[];
  materials: Pick<Material, "name" | "nozzleMin" | "nozzleMax" | "bedMin" | "bedMax">[];
  submitLabel: string;
  showThenSpool?: boolean;
};

export function FilamentForm({ action, defaults = {}, brands, materials, submitLabel, showThenSpool }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [materialName, setMaterialName] = useState(defaults.materialName ?? "");
  const fe = state.fieldErrors ?? {};
  const material = materials.find((m) => m.name.toLowerCase() === materialName.toLowerCase());
  const ph = (v: number | null | undefined) => (v != null ? String(v) : undefined);
  const num = (v: number | null | undefined) => (v != null ? String(v) : "");

  return (
    <ActionForm action={formAction} pending={pending} className="grid gap-6">
      <FormError message={state.error} />
      <Card>
        <CardHeader>
          <CardTitle>Filament</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand" htmlFor="brand" error={fe.brand} hint="Pick or type a new one">
            <Input id="brand" name="brand" list="brand-options" defaultValue={defaults.brandName ?? ""} placeholder="Prusament" />
            <datalist id="brand-options">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Material" htmlFor="material" error={fe.material}>
            <Input
              id="material"
              name="material"
              list="material-options"
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              placeholder="PLA"
            />
            <datalist id="material-options">
              {materials.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Product name" htmlFor="name" error={fe.name} className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={defaults.name ?? ""} required placeholder="Prusament PLA Galaxy Black 1kg" />
          </Field>
          <Field label="Color name" htmlFor="colorName" error={fe.colorName}>
            <Input id="colorName" name="colorName" defaultValue={defaults.colorName ?? ""} placeholder="Galaxy Black" />
          </Field>
          <Field label="Color" htmlFor="colorHex" error={fe.colorHex}>
            <ColorField id="colorHex" name="colorHex" defaultValue={defaults.colorHex} />
          </Field>
          <Field label="Diameter (mm)" htmlFor="diameter" error={fe.diameter}>
            <Input id="diameter" name="diameter" inputMode="decimal" defaultValue={num(defaults.diameter) || "1.75"} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Net weight (g)" htmlFor="nominalWeight" error={fe.nominalWeight}>
              <Input id="nominalWeight" name="nominalWeight" inputMode="numeric" defaultValue={num(defaults.nominalWeight) || "1000"} />
            </Field>
            <Field label="Empty spool (g)" htmlFor="spoolWeight" error={fe.spoolWeight}>
              <Input id="spoolWeight" name="spoolWeight" inputMode="numeric" defaultValue={num(defaults.spoolWeight)} placeholder="e.g. 200" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Print settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nozzle min °C" htmlFor="nozzleMin" error={fe.nozzleMin}>
              <Input id="nozzleMin" name="nozzleMin" inputMode="numeric" defaultValue={num(defaults.nozzleMin)} placeholder={ph(material?.nozzleMin)} />
            </Field>
            <Field label="Nozzle max °C" htmlFor="nozzleMax" error={fe.nozzleMax}>
              <Input id="nozzleMax" name="nozzleMax" inputMode="numeric" defaultValue={num(defaults.nozzleMax)} placeholder={ph(material?.nozzleMax)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bed min °C" htmlFor="bedMin" error={fe.bedMin}>
              <Input id="bedMin" name="bedMin" inputMode="numeric" defaultValue={num(defaults.bedMin)} placeholder={ph(material?.bedMin)} />
            </Field>
            <Field label="Bed max °C" htmlFor="bedMax" error={fe.bedMax}>
              <Input id="bedMax" name="bedMax" inputMode="numeric" defaultValue={num(defaults.bedMax)} placeholder={ph(material?.bedMax)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Drying °C" htmlFor="dryingTemp" error={fe.dryingTemp}>
              <Input id="dryingTemp" name="dryingTemp" inputMode="numeric" defaultValue={num(defaults.dryingTemp)} />
            </Field>
            <Field label="Drying hours" htmlFor="dryingHours" error={fe.dryingHours}>
              <Input id="dryingHours" name="dryingHours" inputMode="decimal" defaultValue={num(defaults.dryingHours)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max speed (mm/s)" htmlFor="maxSpeed" error={fe.maxSpeed}>
              <Input id="maxSpeed" name="maxSpeed" inputMode="numeric" defaultValue={num(defaults.maxSpeed)} />
            </Field>
            <Field label="Cooling fan" htmlFor="fan" error={fe.fan}>
              <Input id="fan" name="fan" defaultValue={defaults.fan ?? ""} placeholder="e.g. 50–100%" />
            </Field>
          </div>
          {material && (
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Empty temperature fields fall back to the {material.name} defaults shown as placeholders.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links &amp; rating</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Product page" htmlFor="productUrl" error={fe.productUrl}>
            <Input id="productUrl" name="productUrl" type="url" defaultValue={defaults.productUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Image URL" htmlFor="imageUrl" error={fe.imageUrl}>
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={defaults.imageUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Rating (1–5)" htmlFor="rating" error={fe.rating}>
            <Input id="rating" name="rating" type="number" min={1} max={5} defaultValue={num(defaults.rating)} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {showThenSpool && (
          <SubmitButton variant="outline" size="lg" name="then" value="spool">
            Save &amp; add a spool
          </SubmitButton>
        )}
        <SubmitButton size="lg">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
