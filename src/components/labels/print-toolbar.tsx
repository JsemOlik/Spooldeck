"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({
  count,
  pages,
  paper,
  autoPrint,
}: {
  count: number;
  pages: number;
  paper: string;
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    let cancelled = false;
    // Wait for fonts so the first print preview isn't laid out with fallbacks.
    document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrint]);

  return (
    <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b px-4 py-3 print:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link href="/labels">
          <ArrowLeftIcon />
          Designer
        </Link>
      </Button>
      <p className="text-muted-foreground min-w-0 flex-1 text-sm">
        {count} label{count === 1 ? "" : "s"} on {pages} page{pages === 1 ? "" : "s"}. Paper: <b>{paper}</b>, margins{" "}
        <b>None</b>, scale <b>100%</b>.
      </p>
      <Button size="sm" onClick={() => window.print()}>
        <PrinterIcon />
        Print
      </Button>
    </div>
  );
}
