"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteFilamentAction, setFilamentArchivedAction } from "@/actions/filaments";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FilamentActions({ id, archived }: { id: number; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const [, setTick] = useState(0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions" disabled={pending}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/filaments/${id}/edit`}>
            <PencilIcon />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => startTransition(() => setFilamentArchivedAction(id, !archived))}>
          {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (!confirm("Delete this filament and its notes?")) return;
            startTransition(async () => {
              const res = await deleteFilamentAction(id);
              if (res?.error) toast.error(res.error);
              setTick((t) => t + 1);
            });
          }}
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
