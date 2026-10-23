"use client";

import { useActionState } from "react";
import { importPrusamentAction } from "@/actions/scan";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";

export function ImportForm({
  url,
  currency,
  vendors,
  locations,
  initialWeight,
}: {
  url: string;
  currency: string;
  vendors: string[];
  locations: string[];
  initialWeight: number;
}) {
  const [state, action, pending] = useActionState(importPrusamentAction, initialActionState);
  const fe = state.fieldErrors ?? {};
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="url" value={url} />
      <div className="sm:col-span-2">
        <FormError message={state.error} />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="Price" htmlFor="price" error={fe.price}>
          <Input id="price" name="price" inputMode="decimal" placeholder="29.99" autoFocus />
        </Field>
        <Field label="Currency" htmlFor="currency" error={fe.currency}>
          <Input id="currency" name="currency" defaultValue={currency} maxLength={3} className="uppercase" />
        </Field>
      </div>
      <Field label="Bought from" htmlFor="vendor" error={fe.vendor}>
        <Input id="vendor" name="vendor" list="vendor-options" defaultValue="Prusa Research" />
        <datalist id="vendor-options">
          {vendors.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Field>
      <Field label="Purchase date" htmlFor="purchaseDate" error={fe.purchaseDate}>
        <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </Field>
      <Field label="Location" htmlFor="location" error={fe.location}>
        <Input id="location" name="location" list="location-options" placeholder="Dry box 1" />
        <datalist id="location-options">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Field>
      <Field label="Remaining now (g)" htmlFor="remaining" error={fe.remaining} hint={`Leave empty for a new ${initialWeight} g spool`}>
        <Input id="remaining" name="remaining" inputMode="decimal" />
      </Field>
      <Field label="Notes" htmlFor="notes" error={fe.notes} className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton size="lg">Add to inventory</SubmitButton>
      </div>
    </ActionForm>
  );
}
