"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deletePrinterAction, savePrinterAction } from "@/actions/printers";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, initialActionState } from "@/lib/action-state";

type SaveState = ActionState & { online?: boolean };
type Editable = { id: number; name: string; url: string; hasApiKey: boolean };

/** Adds a printer, or edits one when `printer` is given. */
export function PrinterDialog({ printer, trigger }: { printer?: Editable; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {/* Mounted only while open, so each opening starts with a fresh form state. */}
        <PrinterForm printer={printer} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PrinterForm({ printer, onDone }: { printer?: Editable; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (prev, formData) => {
    const result = await savePrinterAction(printer?.id ?? null, prev, formData);
    // Toast here rather than in an effect: adding the first printer swaps the page's empty
    // state (and this dialog) out before an effect would run.
    if (result.ok) {
      if (result.online) toast.success(result.message);
      else toast.warning(result.message);
      onDone();
    }
    return result;
  }, initialActionState);
  const [clearKey, setClearKey] = useState(false);
  const [deleting, startDelete] = useTransition();
  const fe = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <ActionForm action={formAction} pending={pending} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{printer ? `Edit ${printer.name}` : "Add printer"}</DialogTitle>
        <DialogDescription>
          A Klipper printer running Moonraker, the API that Mainsail and Fluidd use. Spooldeck&apos;s server connects to it, so it
          has to be reachable from there.
        </DialogDescription>
      </DialogHeader>
      {!state.ok && !state.fieldErrors && <FormError message={state.error} />}
      <Field label="Name" htmlFor="printer-name" error={fe.name}>
        <Input id="printer-name" name="name" required maxLength={100} defaultValue={printer?.name} placeholder="e.g. Voron" />
      </Field>
      <Field
        label="Moonraker address"
        htmlFor="printer-url"
        error={fe.url}
        hint="The address you open Mainsail or Fluidd on usually works, or the printer's IP with port 7125."
      >
        <Input
          id="printer-url"
          name="url"
          required
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={printer?.url}
          placeholder="http://voron.local:7125"
        />
      </Field>
      <Field
        label="API key"
        htmlFor="printer-key"
        error={fe.apiKey}
        hint={
          printer?.hasApiKey
            ? "A key is saved. Leave this empty to keep it."
            : "Only needed when Moonraker requires sign-in and Spooldeck's address isn't in trusted_clients."
        }
      >
        <Input id="printer-key" name="apiKey" type="password" autoComplete="off" placeholder="Optional" disabled={clearKey} />
      </Field>
      {printer?.hasApiKey && (
        <div className="flex items-center gap-2">
          <Checkbox id="printer-clear-key" checked={clearKey} onCheckedChange={(v) => setClearKey(v === true)} />
          <input type="hidden" name="clearApiKey" value={clearKey ? "on" : "off"} />
          <Label htmlFor="printer-clear-key" className="font-normal">
            Remove the saved API key
          </Label>
        </div>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        {printer ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={deleting || pending}
            onClick={() => {
              if (!confirm(`Remove ${printer.name}? Usage already logged stays on the spools.`)) return;
              startDelete(async () => {
                const result = await deletePrinterAction(printer.id);
                if (result.ok) {
                  toast.success(result.message);
                  onDone();
                } else toast.error(result.error);
              });
            }}
          >
            <Trash2Icon />
            Remove
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton>{printer ? "Save" : "Add printer"}</SubmitButton>
      </DialogFooter>
    </ActionForm>
  );
}
