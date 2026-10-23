"use client";

import { useActionState } from "react";
import { setupAction } from "@/actions/auth";
import { Field, FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";

export function SetupForm() {
  const [state, action] = useActionState(setupAction, initialActionState);
  const fe = state.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      <Field
        label="Setup code"
        htmlFor="setupCode"
        error={fe?.setupCode}
        hint="Printed in the server logs when Spooldeck starts without an account."
      >
        <Input id="setupCode" name="setupCode" placeholder="XXXX-XXXX" autoComplete="off" autoCapitalize="characters" required autoFocus className="font-mono uppercase" />
      </Field>
      <Field label="Username" htmlFor="username" error={fe?.username}>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Repeat password" htmlFor="confirm" error={fe?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg">Create account</SubmitButton>
    </form>
  );
}
