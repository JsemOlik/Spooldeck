"use client";

import { createContext, startTransition, useContext } from "react";

const PendingContext = createContext(false);

export function useActionFormPending() {
  return useContext(PendingContext);
}

/**
 * A form that submits to a useActionState action without React's automatic
 * form reset, so typed values survive validation errors.
 */
export function ActionForm({
  action,
  pending,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <PendingContext value={pending}>
      <form
        {...props}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const formData = new FormData(e.currentTarget, submitter);
          startTransition(() => action(formData));
        }}
      />
    </PendingContext>
  );
}
