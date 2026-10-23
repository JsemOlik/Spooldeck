"use client";

import { Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useActionFormPending } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, pending: pendingProp, ...props }: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  const { pending } = useFormStatus();
  const contextPending = useActionFormPending();
  const busy = pendingProp ?? (pending || contextPending);
  return (
    <Button type="submit" disabled={busy || props.disabled} {...props}>
      {busy && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}
