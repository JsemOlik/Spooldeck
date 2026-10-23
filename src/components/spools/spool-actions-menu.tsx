"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArchiveIcon, CopyIcon, MoreHorizontalIcon, PackageCheckIcon, PackageXIcon, PencilIcon, TagIcon, Trash2Icon } from "lucide-react";
import { deleteSpoolAction, setSpoolStatusAction } from "@/actions/spools";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SpoolStatus } from "@/db/schema";

export function SpoolActionsMenu({ spoolId, filamentId, status }: { spoolId: number; filamentId: number; status: SpoolStatus }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const setStatus = (s: SpoolStatus) => startTransition(() => setSpoolStatusAction(spoolId, s));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-lg" aria-label="More actions" disabled={pending}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={`/spools/${spoolId}/edit`}>
              <PencilIcon />
              Edit spool
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/labels?spools=${spoolId}`}>
              <TagIcon />
              Print label
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/spools/new?filament=${filamentId}`}>
              <CopyIcon />
              Add another of this filament
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status !== "empty" && (
            <DropdownMenuItem onSelect={() => setStatus("empty")}>
              <PackageXIcon />
              Mark as empty
            </DropdownMenuItem>
          )}
          {status !== "opened" && (
            <DropdownMenuItem onSelect={() => setStatus("opened")}>
              <PackageCheckIcon />
              Mark as open
            </DropdownMenuItem>
          )}
          {status !== "archived" && (
            <DropdownMenuItem onSelect={() => setStatus("archived")}>
              <ArchiveIcon />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2Icon />
            Delete spool
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this spool?</AlertDialogTitle>
            <AlertDialogDescription>
              Its usage history is deleted too. Notes stay on the filament. Archive it instead if you want to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => startTransition(() => deleteSpoolAction(spoolId))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
