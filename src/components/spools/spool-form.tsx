"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { ColorSwatch } from "@/components/color-swatch";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SPOOL_STATUSES, type Spool, type SpoolStatus } from "@/db/schema";
import type { FilamentOption } from "@/db/queries/filaments";
import { STATUS_LABELS } from "@/components/spools/status-badge";
import { type ActionState, initialActionState } from "@/lib/action-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  filaments: FilamentOption[];
  vendors: string[];
  locations: string[];
  currency: string;
  defaults?: Partial<Spool> & { vendorName?: string | null };
  mode: "create" | "edit";
};

function filamentLabel(f: FilamentOption) {
  return [f.brandName, f.materialName, f.colorName || f.name].filter(Boolean).join(" · ");
}

// Radix Select items can't have an empty value; this one submits as "" (status picked from the weight).
const AUTO_STATUS = "__auto";

export function SpoolForm({ action, filaments, vendors, locations, currency, defaults = {}, mode }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const fe = state.fieldErrors ?? {};
  const [filamentId, setFilamentId] = useState(defaults.filamentId ? String(defaults.filamentId) : "");
  const [status, setStatus] = useState<string>(defaults.status ?? AUTO_STATUS);
  const selected = filaments.find((f) => String(f.id) === filamentId);
  const [initialWeight, setInitialWeight] = useState(
    defaults.initialWeight != null ? String(defaults.initialWeight) : selected ? String(selected.nominalWeight) : "1000",
  );
  const [spoolWeight, setSpoolWeight] = useState(
    defaults.spoolWeight != null ? String(defaults.spoolWeight) : selected?.spoolWeight != null ? String(selected.spoolWeight) : "",
  );

  function onFilamentChange(id: string) {
    setFilamentId(id);
    const f = filaments.find((x) => String(x.id) === id);
    if (f && mode === "create") {
      setInitialWeight(String(f.nominalWeight));
      setSpoolWeight(f.spoolWeight != null ? String(f.spoolWeight) : "");
    }
  }

  return (
    <ActionForm action={formAction} pending={pending} className="grid gap-6">
      <FormError message={state.error} />
      <Card>
        <CardHeader>
          <CardTitle>Spool</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Filament" htmlFor="filamentId" error={fe.filamentId} className="sm:col-span-2">
            <div className="flex gap-2">
              <input type="hidden" name="filamentId" value={filamentId} />
              <Select value={filamentId} onValueChange={onFilamentChange}>
                <SelectTrigger id="filamentId" className="min-w-0 flex-1" aria-invalid={!!fe.filamentId}>
                  <SelectValue placeholder="Choose a filament…">
                    {selected && (
                      <>
                        <ColorSwatch hex={selected.colorHex} className="size-4" />
                        <span className="truncate">{filamentLabel(selected)}</span>
                      </>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-(--radix-select-content-available-width)">
                  {filaments.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)} className="*:[span]:last:min-w-0">
                      <ColorSwatch hex={f.colorHex} className="size-4" />
                      <span className="truncate">{filamentLabel(f)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "create" && (
                <Button asChild variant="outline">
                  <Link href="/filaments/new?then=spool">
                    <PlusIcon />
                    New
                  </Link>
                </Button>
              )}
            </div>
          </Field>
          <Field label="Initial net weight (g)" htmlFor="initialWeight" error={fe.initialWeight} hint="Filament only, as sold">
            <Input id="initialWeight" name="initialWeight" inputMode="numeric" value={initialWeight} onChange={(e) => setInitialWeight(e.target.value)} required />
          </Field>
          <Field label="Empty spool weight (g)" htmlFor="spoolWeight" error={fe.spoolWeight} hint="Used for weigh-ins">
            <Input id="spoolWeight" name="spoolWeight" inputMode="numeric" value={spoolWeight} onChange={(e) => setSpoolWeight(e.target.value)} />
          </Field>
          {mode === "create" && (
            <>
              <Field label="Remaining now (g)" htmlFor="remaining" error={fe.remaining} hint="Only if the spool is already partly used">
                <Input id="remaining" name="remaining" inputMode="decimal" />
              </Field>
              <Field label="How many spools?" htmlFor="quantity" error={fe.quantity} hint="Each gets its own QR code">
                <Input id="quantity" name="quantity" type="number" min={1} max={50} defaultValue={1} />
              </Field>
            </>
          )}
          <Field label="Location" htmlFor="location" error={fe.location}>
            <Input id="location" name="location" list="location-options" defaultValue={defaults.location ?? ""} placeholder="Dry box 1" />
            <datalist id="location-options">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>
          <Field label="Status" htmlFor="status" error={fe.status}>
            <input type="hidden" name="status" value={status === AUTO_STATUS ? "" : status} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue>{status === AUTO_STATUS ? "Automatic" : STATUS_LABELS[status as SpoolStatus]}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {mode === "create" && <SelectItem value={AUTO_STATUS}>Automatic</SelectItem>}
                {SPOOL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Field label="Price" htmlFor="price" error={fe.price}>
              <Input id="price" name="price" inputMode="decimal" defaultValue={defaults.price ?? ""} placeholder="24.99" />
            </Field>
            <Field label="Currency" htmlFor="currency" error={fe.currency}>
              <Input id="currency" name="currency" defaultValue={defaults.currency ?? currency} maxLength={3} className="uppercase" />
            </Field>
          </div>
          <Field label="Bought from" htmlFor="vendor" error={fe.vendor}>
            <Input id="vendor" name="vendor" list="vendor-options" defaultValue={defaults.vendorName ?? ""} placeholder="Prusa Research" />
            <datalist id="vendor-options">
              {vendors.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="Purchase date" htmlFor="purchaseDate" error={fe.purchaseDate}>
            <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={defaults.purchaseDate ?? ""} />
          </Field>
          <Field label="Order / product link" htmlFor="purchaseUrl" error={fe.purchaseUrl}>
            <Input id="purchaseUrl" name="purchaseUrl" type="url" defaultValue={defaults.purchaseUrl ?? ""} placeholder="https://" />
          </Field>
          <Field label="Notes" htmlFor="notes" error={fe.notes} className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg">{mode === "create" ? "Add spool" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
