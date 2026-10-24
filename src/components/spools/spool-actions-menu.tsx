"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArchiveIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PackageCheckIcon,
  PackageXIcon,
  PencilIcon,
  PrinterIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { loadSpoolAction } from "@/actions/printers";
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

export function SpoolActionsMenu({
  spoolId,
  filamentId,
  status,
  printers = [],
}: {
  spoolId: number;
  filamentId: number;
  status: SpoolStatus;
  /** Printers this spool can go on; `loaded` marks the one it's on. */
  printers?: { id: number; name: string; loaded: boolean }[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const setStatus = (s: SpoolStatus) => startTransition(() => setSpoolStatusAction(spoolId, s));
  const load = (printerId: number, load: boolean) =>
    startTransition(async () => {
      const result = await loadSpoolAction(printerId, load ? spoolId : null);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

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
          {printers.length > 0 && <DropdownMenuSeparator />}
          {printers.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => load(p.id, !p.loaded)}>
              <PrinterIcon />
              {p.loaded ? `Unload from ${p.name}` : `Load on ${p.name}`}
            </DropdownMenuItem>
          ))}
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
