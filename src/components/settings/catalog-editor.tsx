"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { type CatalogKind, deleteCatalogItemAction, renameLocationAction, saveCatalogItemAction } from "@/actions/settings";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, initialActionState } from "@/lib/action-state";

export type CatalogField = {
  name: string;
  label: string;
  type?: "text" | "url" | "number" | "textarea";
  step?: string;
  placeholder?: string;
  half?: boolean;
};

export type CatalogRow = {
  id: number;
  values: Record<string, string | number | null>;
  /** Short secondary text, e.g. "3 filaments · 1.24 g/cm³". */
  detail: string;
  /** Shown in the delete confirmation. */
  usage: number;
};

export function CatalogEditor({
  kind,
  singular,
  usageNoun,
  fields,
  rows,
  defaults = {},
}: {
  kind: CatalogKind;
  singular: string;
  usageNoun: string;
  fields: CatalogField[];
  rows: CatalogRow[];
  defaults?: Record<string, string | number>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.values.name}</p>
                <p className="text-muted-foreground truncate text-xs">{row.detail}</p>
              </div>
              <ItemDialog
                title={`Edit ${singular}`}
                fields={fields}
                values={row.values}
                action={saveCatalogItemAction.bind(null, kind, row.id)}
                onDelete={async () => {
                  const warn = row.usage
                    ? ` It's used by ${row.usage} ${usageNoun}${row.usage === 1 ? "" : "s"}; they'll keep their data but lose this ${singular}.`
                    : "";
                  if (!confirm(`Delete “${row.values.name}”?${warn}`)) return false;
                  await deleteCatalogItemAction(kind, row.id);
                  toast.success(`Deleted ${row.values.name}`);
                  return true;
                }}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.values.name}`}>
                    <PencilIcon />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div>
        <ItemDialog
          title={`Add ${singular}`}
          fields={fields}
          values={defaults}
          action={saveCatalogItemAction.bind(null, kind, null)}
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon />
              Add {singular}
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function LocationsEditor({ locations }: { locations: { name: string; spools: number }[] }) {
  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">Locations appear here once you set one on a spool.</p>;
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {locations.map((l) => (
        <li key={l.name} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{l.name}</p>
            <p className="text-muted-foreground text-xs">
              {l.spools} spool{l.spools === 1 ? "" : "s"}
            </p>
          </div>
          <ItemDialog
            title="Rename location"
            description="Renames it on every spool. Use an existing name to merge, or leave empty to clear it."
            fields={[{ name: "name", label: "Location" }]}
            values={{ name: l.name }}
            optionalName
            action={renameLocationAction.bind(null, l.name)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Rename ${l.name}`}>
                <PencilIcon />
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}

function ItemDialog(props: {
  title: string;
  description?: string;
  fields: CatalogField[];
  values: Record<string, string | number | null>;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onDelete?: () => Promise<boolean>;
  optionalName?: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent>
        {/* Mounted only while open, so each opening starts with a fresh form state. */}
        <ItemForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  title,
  description,
  fields,
  values,
  action,
  onDelete,
  optionalName,
  onDone,
}: Parameters<typeof ItemDialog>[0] & { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [deleting, startDelete] = useTransition();
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
  const fe = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <ActionForm action={formAction} pending={pending} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {!state.ok && !state.fieldErrors && <FormError message={state.error} />}
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          const id = `catalog-${f.name}`;
          const common = {
            id,
            name: f.name,
            defaultValue: values[f.name] ?? "",
            placeholder: f.placeholder,
            "aria-invalid": fe[f.name] ? true : undefined,
          };
          return (
            <Field key={f.name} label={f.label} htmlFor={id} error={fe[f.name]} className={f.half ? undefined : "col-span-2"}>
              {f.type === "textarea" ? (
                <Textarea rows={3} {...common} />
              ) : (
                <Input
                  type={f.type ?? "text"}
                  step={f.step}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  required={f.name === "name" && !optionalName}
                  {...common}
                />
              )}
            </Field>
          );
        })}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={deleting || pending}
            onClick={() =>
              startDelete(async () => {
                if (await onDelete()) onDone();
              })
            }
          >
            <Trash2Icon />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton>Save</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}
