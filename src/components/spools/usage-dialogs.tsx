"use client";

import { useActionState, useEffect, useState } from "react";
import { MinusCircleIcon, ScaleIcon } from "lucide-react";
import { toast } from "sonner";
import { logUsageAction, weighInAction } from "@/actions/spools";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { formatGrams } from "@/lib/format";

function useCloseOnSuccess(state: ActionState, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      if (state.message) toast.success(state.message);
    }
  }, [state, setOpen]);
}

const QUICK_GRAMS = [5, 10, 25, 50, 100];

export function LogUsageDialog({ spoolId, remaining, size = "lg", defaultOpen = false }: { spoolId: number; remaining: number; size?: "lg" | "default"; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState(logUsageAction.bind(null, spoolId), initialActionState);
  const [grams, setGrams] = useState("");
  useCloseOnSuccess(state, setOpen);
  const fe = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setGrams("");
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} className="flex-1 sm:flex-none">
          <MinusCircleIcon />
          Log usage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ActionForm action={action} pending={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Log a print</DialogTitle>
            <DialogDescription>{formatGrams(remaining)} left on this spool. Enter what the slicer said the print used.</DialogDescription>
          </DialogHeader>
          {!state.ok && <FormError message={state.error} />}
          <Field label="Grams used" htmlFor="grams" error={fe.grams}>
            <Input
              id="grams"
              name="grams"
              inputMode="decimal"
              autoFocus
              required
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="h-12 text-2xl font-semibold"
              placeholder="0"
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_GRAMS.map((g) => (
                <Button key={g} type="button" variant="secondary" size="sm" onClick={() => setGrams(String((Number(grams) || 0) + g))}>
                  +{g}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Print name" htmlFor="printName" error={fe.printName}>
            <Input id="printName" name="printName" placeholder="Benchy" />
          </Field>
          <Field label="Note" htmlFor="note" error={fe.note}>
            <Input id="note" name="note" placeholder="Optional" />
          </Field>
          <DialogFooter>
            <SubmitButton size="lg">Save</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function WeighInDialog({ spoolId, spoolWeight }: { spoolId: number; spoolWeight: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(weighInAction.bind(null, spoolId), initialActionState);
  const [includesSpool, setIncludesSpool] = useState(spoolWeight != null);
  useCloseOnSuccess(state, setOpen);
  const fe = state.ok ? {} : (state.fieldErrors ?? {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="flex-1 sm:flex-none">
          <ScaleIcon />
          Weigh-in
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ActionForm action={action} pending={pending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Weigh the spool</DialogTitle>
            <DialogDescription>Put the spool on a scale to correct the remaining weight. The difference is logged.</DialogDescription>
          </DialogHeader>
          {!state.ok && <FormError message={state.error} />}
          <Field label="Scale reading (g)" htmlFor="scaleGrams" error={fe.scaleGrams}>
            <Input id="scaleGrams" name="scaleGrams" inputMode="decimal" autoFocus required className="h-12 text-2xl font-semibold" placeholder="0" />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox id="includesSpool" checked={includesSpool} onCheckedChange={(v) => setIncludesSpool(v === true)} />
            <input type="hidden" name="includesSpool" value={includesSpool ? "on" : "off"} />
            <Label htmlFor="includesSpool" className="font-normal">
              Reading includes the empty spool{spoolWeight != null ? ` (${spoolWeight} g)` : " (weight not set)"}
            </Label>
          </div>
          <Field label="Note" htmlFor="weigh-note" error={fe.note}>
            <Input id="weigh-note" name="note" placeholder="Optional" />
          </Field>
          <DialogFooter>
            <SubmitButton size="lg">Update weight</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
