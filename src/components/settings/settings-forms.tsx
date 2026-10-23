"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, LogOutIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { changePasswordAction, logoutEverywhereAction } from "@/actions/auth";
import { saveSettingsAction } from "@/actions/settings";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, initialActionState } from "@/lib/action-state";
import type { AppSettings } from "@/lib/settings";

function useToastOnSuccess(state: ActionState, after?: () => void) {
  const afterRef = useRef(after);
  useEffect(() => {
    afterRef.current = after;
  });
  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      afterRef.current?.();
    }
  }, [state]);
}

export function GeneralSettingsForm({ settings, detectedUrl }: { settings: AppSettings; detectedUrl: string }) {
  const [state, action, pending] = useActionState(saveSettingsAction, initialActionState);
  useToastOnSuccess(state);
  const fe = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      {!state.ok && !state.fieldErrors && <FormError message={state.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency" htmlFor="currency" error={fe.currency} hint="Default for new spools, e.g. EUR, USD, CZK">
          <Input id="currency" name="currency" defaultValue={settings.currency} maxLength={3} className="uppercase" required />
        </Field>
        <Field label="Low stock below (g)" htmlFor="lowStockGrams" error={fe.lowStockGrams} hint="Spools under this show as low">
          <Input
            id="lowStockGrams"
            name="lowStockGrams"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            defaultValue={settings.lowStockGrams}
            required
          />
        </Field>
      </div>
      <Field
        label="Public URL"
        htmlFor="publicUrl"
        error={fe.publicUrl}
        hint={
          <>
            Encoded in label QR codes so your phone camera can open spools. Leave empty to use the address you&apos;re on
            now ({detectedUrl}).
          </>
        }
      >
        <Input id="publicUrl" name="publicUrl" type="url" defaultValue={settings.publicUrl} placeholder="https://spools.example.com" />
      </Field>
      <div>
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useToastOnSuccess(state, () => ref.current?.reset());
  const fe = state.ok ? {} : (state.fieldErrors ?? {});
  return (
    <ActionForm ref={ref} action={action} pending={pending} className="grid gap-4">
      {!state.ok && !state.fieldErrors && <FormError message={state.error} />}
      <Field label="Current password" htmlFor="current" error={fe.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="password" error={fe.password}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <Field label="Repeat new password" htmlFor="confirm" error={fe.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>Change password</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function LogoutEverywhereButton({ sessions }: { sessions: number }) {
  return (
    <form
      action={logoutEverywhereAction}
      onSubmit={(e) => {
        if (!confirm("Sign out of Spooldeck on every device, including this one?")) e.preventDefault();
      }}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-muted-foreground text-sm">
        {sessions} active session{sessions === 1 ? "" : "s"}.
      </p>
      <Button type="submit" variant="outline">
        <LogOutIcon />
        Sign out everywhere
      </Button>
    </form>
  );
}

export function BackupCard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function restore() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Import failed (${res.status})`);
        return;
      }
      const c = body.counts ?? {};
      toast.success(`Restored ${c.spools ?? 0} spools, ${c.filaments ?? 0} filaments and ${c.usageLogs ?? 0} usage entries.`);
      setFile(null);
      setConfirmed(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-muted-foreground text-sm">
          Downloads everything except your login: filaments, spools, usage, notes, label templates and settings.
        </p>
        <div>
          <Button asChild variant="outline">
            <a href="/api/backup" download>
              <DownloadIcon />
              Download backup
            </a>
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        <Field label="Restore from backup" htmlFor="backup-file" hint="Replaces all current data with the file's contents.">
          <Input
            ref={inputRef}
            id="backup-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(undefined);
            }}
          />
        </Field>
        {file && (
          <>
            <div className="flex items-start gap-2">
              <Checkbox id="backup-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <Label htmlFor="backup-confirm" className="leading-snug font-normal">
                Replace all filaments, spools and usage with “{file.name}”. This can&apos;t be undone.
              </Label>
            </div>
            <FormError message={error} />
            <div>
              <Button variant="destructive" disabled={!confirmed || busy} onClick={restore}>
                <UploadIcon />
                {busy ? "Restoring…" : "Restore backup"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
