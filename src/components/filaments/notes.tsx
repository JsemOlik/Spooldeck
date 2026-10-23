"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { addNoteAction, deleteNoteAction } from "@/actions/filaments";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";

export function NoteForm({ filamentId, spoolId }: { filamentId: number; spoolId?: number }) {
  const [state, action, pending] = useActionState(addNoteAction.bind(null, filamentId), initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <ActionForm ref={ref} action={action} pending={pending} className="grid gap-2">
      {!state.ok && <FormError message={state.fieldErrors?.body?.[0] ?? state.error} />}
      {spoolId && <input type="hidden" name="spoolId" value={spoolId} />}
      <Textarea name="body" rows={2} placeholder="e.g. Strings above 220 °C, 0.4 mm retraction works well…" required />
      <div className="flex justify-end">
        <SubmitButton size="sm" variant="secondary">
          Add note
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

type Note = { id: number; body: string; createdAt: Date; spool?: { id: number; code: string } | null };

export function NotesList({ notes, emptyText = "No notes yet." }: { notes: Note[]; emptyText?: string }) {
  const [pending, startTransition] = useTransition();
  if (notes.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  return (
    <ul className={pending ? "grid gap-3 opacity-60" : "grid gap-3"}>
      {notes.map((n) => (
        <li key={n.id} className="group bg-muted/40 rounded-lg px-3 py-2">
          <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs">
            <span>{formatDateTime(n.createdAt)}</span>
            {n.spool && (
              <Link href={`/spools/${n.spool.id}`} className="font-mono hover:underline">
                #{n.spool.code}
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Delete note"
              onClick={() => startTransition(() => deleteNoteAction(n.id))}
            >
              <Trash2Icon />
            </Button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
