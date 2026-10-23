import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "@/components/scan/scanner";
import { strParam } from "@/lib/params";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const missing = strParam((await searchParams).missing);
  return (
    <>
      <PageHeader
        title="Scan"
        description="Scan the QR code on a Prusament spool to import it, or a Spooldeck label to open the spool."
      />
      <Scanner initialError={missing ? `No spool with code ${missing.toUpperCase()}.` : undefined} />
    </>
  );
}
