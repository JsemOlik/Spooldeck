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
import { ColorSwatch } from "@/components/color-swatch";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  /** Printers this spool can go on; `loadedTool` is set on the one it's on, `slots` says what's on each tool. */
  printers?: {
    id: number;
    name: string;
    tools: number;
    loadedTool: number | null;
    slots?: { colorHex: string | null; name: string | null }[];
  }[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const setStatus = (s: SpoolStatus) => startTransition(() => setSpoolStatusAction(spoolId, s));
  const load = (printerId: number, tool: number, load: boolean) =>
    startTransition(async () => {
      const result = await loadSpoolAction(printerId, load ? spoolId : null, tool);
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
          {printers.map((p) =>
            p.loadedTool != null ? (
              <DropdownMenuItem key={p.id} onSelect={() => load(p.id, p.loadedTool!, false)}>
                <PrinterIcon />
                Unload from {p.tools > 1 ? `${p.name} · tool ${p.loadedTool + 1}` : p.name}
              </DropdownMenuItem>
            ) : p.tools > 1 ? (
              <DropdownMenuSub key={p.id}>
                <DropdownMenuSubTrigger>
                  <PrinterIcon />
                  Load on {p.name}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {Array.from({ length: p.tools }, (_, tool) => {
                    const on = p.slots?.[tool];
                    return (
                      <DropdownMenuItem key={tool} onSelect={() => load(p.id, tool, true)}>
                        {on?.name ? (
                          <ColorSwatch hex={on.colorHex} className="size-4" />
                        ) : (
                          <span className="border-muted-foreground/40 size-4 shrink-0 rounded-full border-2 border-dashed" />
                        )}
                        <span className="font-medium tabular">T{tool + 1}</span>
                        <span className="text-muted-foreground truncate">{on?.name ?? "Empty"}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem key={p.id} onSelect={() => load(p.id, 0, true)}>
                <PrinterIcon />
                Load on {p.name}
              </DropdownMenuItem>
            ),
          )}
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
