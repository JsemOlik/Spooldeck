"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialActionState);
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4">
      <FormError message={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Username" htmlFor="username" error={state.fieldErrors?.username}>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg">Sign in</SubmitButton>
    </ActionForm>
  );
}
