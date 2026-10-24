"use client";

import { useActionState, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrinterKind } from "@/db/schema";
import { type ActionState, initialActionState } from "@/lib/action-state";

type SaveState = ActionState & { online?: boolean };
type Editable = { id: number; name: string; kind: PrinterKind; url: string; username: string | null; hasApiKey: boolean; tools: number };

const KINDS: Record<
  PrinterKind,
  { label: string; about: string; address: string; addressHint: string; placeholder: string; key: string; keyHint: string; toolsHint: string }
> = {
  moonraker: {
    label: "Klipper (Moonraker)",
    about: "A Klipper printer running Moonraker, the API that Mainsail and Fluidd use.",
    address: "Moonraker address",
    addressHint: "The address you open Mainsail or Fluidd on usually works, or the printer's IP with port 7125.",
    placeholder: "http://voron.local:7125",
    key: "API key",
    keyHint: "Only needed when Moonraker requires sign-in and Spooldeck's address isn't in trusted_clients.",
    toolsHint: "Extruders on a toolchanger or INDX printer. Each one holds its own spool.",
  },
  prusalink: {
    label: "Prusa (PrusaLink)",
    about: "A Prusa MK4, XL, MINI or Core One with PrusaLink turned on, or an MK3 running Prusa-Link.",
    address: "PrusaLink address",
    addressHint: "The printer's IP address, shown in its network settings.",
    placeholder: "http://192.168.1.50",
    key: "Password",
    keyHint: "PrusaLink's password, shown with the username in the printer's network settings.",
    toolsHint: "Toolheads on an XL or an INDX (Prusa's toolchanger), or filament slots on an MMU. Each one holds its own spool.",
  },
};

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
  const [kind, setKind] = useState<PrinterKind>(printer?.kind ?? "moonraker");
  const [clearKey, setClearKey] = useState(false);
  const k = KINDS[kind];
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const fe = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <ActionForm action={formAction} pending={pending} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{printer ? `Edit ${printer.name}` : "Add printer"}</DialogTitle>
        <DialogDescription>
          {k.about} Spooldeck&apos;s server connects to it, so it has to be reachable from there.
        </DialogDescription>
      </DialogHeader>
      {!state.ok && !state.fieldErrors && <FormError message={state.error} />}
      <Field label="Name" htmlFor="printer-name" error={fe.name}>
        <Input id="printer-name" name="name" required maxLength={100} defaultValue={printer?.name} placeholder="e.g. Voron" />
      </Field>
      <Field label="Type" htmlFor="printer-kind" error={fe.kind}>
        <input type="hidden" name="kind" value={kind} />
        <Select value={kind} onValueChange={(v) => setKind(v as PrinterKind)}>
          <SelectTrigger id="printer-kind" className="w-full">
            <SelectValue>{k.label}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            {(Object.keys(KINDS) as PrinterKind[]).map((value) => (
              <SelectItem key={value} value={value}>
                {KINDS[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={k.address} htmlFor="printer-url" error={fe.url} hint={k.addressHint}>
        <Input
          id="printer-url"
          name="url"
          required
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={printer?.url}
          placeholder={k.placeholder}
        />
      </Field>
      {kind === "prusalink" && (
        <Field label="Username" htmlFor="printer-username" error={fe.username} hint="Usually maker.">
          <Input
            id="printer-username"
            name="username"
            maxLength={100}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            defaultValue={printer ? (printer.username ?? "") : "maker"}
          />
        </Field>
      )}
      <Field
        label={k.key}
        htmlFor="printer-key"
        error={fe.apiKey}
        hint={printer?.hasApiKey ? `A ${k.key.toLowerCase()} is saved. Leave this empty to keep it.` : k.keyHint}
      >
        <Input
          id="printer-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={kind === "moonraker" ? "Optional" : undefined}
          disabled={clearKey}
        />
      </Field>
      {printer?.hasApiKey && (
        <div className="flex items-center gap-2">
          <Checkbox id="printer-clear-key" checked={clearKey} onCheckedChange={(v) => setClearKey(v === true)} />
          <input type="hidden" name="clearApiKey" value={clearKey ? "on" : "off"} />
          <Label htmlFor="printer-clear-key" className="font-normal">
            Remove the saved {k.key.toLowerCase()}
          </Label>
        </div>
      )}
      <Field label="Tools" htmlFor="printer-tools" error={fe.tools} hint={k.toolsHint}>
        <Input
          id="printer-tools"
          name="tools"
          type="number"
          inputMode="numeric"
          min={1}
          max={16}
          step={1}
          required
          defaultValue={printer?.tools ?? 1}
          className="w-24"
        />
      </Field>
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
                  // Its own page is gone with it.
                  if (pathname === `/printers/${printer.id}`) router.replace("/printers");
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
