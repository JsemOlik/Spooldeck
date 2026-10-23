import type { Metadata } from "next";
import { and, count, eq, gt } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { CatalogEditor, type CatalogField, LocationsEditor } from "@/components/settings/catalog-editor";
import {
  BackupCard,
  ChangePasswordForm,
  GeneralSettingsForm,
  LogoutEverywhereButton,
} from "@/components/settings/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import { listBrandsWithCounts, listMaterialsWithCounts, listVendorsWithCounts } from "@/db/queries/catalog";
import { listLocationsWithCounts } from "@/db/queries/spools";
import { sessions } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { getBaseUrl } from "@/lib/base-url";
import { formatRange } from "@/lib/format";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

const MATERIAL_FIELDS: CatalogField[] = [
  { name: "name", label: "Name", placeholder: "e.g. PETG-CF" },
  { name: "density", label: "Density (g/cm³)", type: "number", step: "0.01", half: true },
  { name: "nozzleMin", label: "Nozzle min (°C)", type: "number", step: "1", half: true },
  { name: "nozzleMax", label: "Nozzle max (°C)", type: "number", step: "1", half: true },
  { name: "bedMin", label: "Bed min (°C)", type: "number", step: "1", half: true },
  { name: "bedMax", label: "Bed max (°C)", type: "number", step: "1", half: true },
  { name: "notes", label: "Notes", type: "textarea" },
];
const BRAND_FIELDS: CatalogField[] = [
  { name: "name", label: "Name", placeholder: "e.g. Prusament" },
  { name: "website", label: "Website", type: "url", placeholder: "https://" },
];
const VENDOR_FIELDS: CatalogField[] = [
  { name: "name", label: "Name", placeholder: "e.g. Prusa Research" },
  { name: "url", label: "Website", type: "url", placeholder: "https://" },
  { name: "notes", label: "Notes", type: "textarea", placeholder: "Shipping times, discount codes…" },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, baseUrl, materials, brands, vendors, locations, [{ sessionCount }]] = await Promise.all([
    getAppSettings(),
    getBaseUrl(),
    listMaterialsWithCounts(),
    listBrandsWithCounts(),
    listVendorsWithCounts(),
    listLocationsWithCounts(),
    db
      .select({ sessionCount: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))),
  ]);

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.username}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent>
              <GeneralSettingsForm settings={settings} detectedUrl={baseUrl} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>Materials, brands, shops and storage locations used across your filaments.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="materials">
                <TabsList className="w-full">
                  <TabsTrigger value="materials">Materials</TabsTrigger>
                  <TabsTrigger value="brands">Brands</TabsTrigger>
                  <TabsTrigger value="vendors">Shops</TabsTrigger>
                  <TabsTrigger value="locations">Locations</TabsTrigger>
                </TabsList>
                <TabsContent value="materials" className="min-w-0 pt-2">
                  <CatalogEditor
                    kind="materials"
                    singular="material"
                    usageNoun="filament"
                    fields={MATERIAL_FIELDS}
                    defaults={{ density: 1.24 }}
                    rows={materials.map((m) => ({
                      id: m.id,
                      values: m,
                      usage: m.filaments,
                      detail: [
                        plural(m.filaments, "filament"),
                        `${m.density} g/cm³`,
                        m.nozzleMin || m.nozzleMax ? `nozzle ${formatRange(m.nozzleMin, m.nozzleMax, "°C")}` : null,
                        m.bedMin || m.bedMax ? `bed ${formatRange(m.bedMin, m.bedMax, "°C")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                  />
                </TabsContent>
                <TabsContent value="brands" className="min-w-0 pt-2">
                  <CatalogEditor
                    kind="brands"
                    singular="brand"
                    usageNoun="filament"
                    fields={BRAND_FIELDS}
                    rows={brands.map((b) => ({
                      id: b.id,
                      values: b,
                      usage: b.filaments,
                      detail: [plural(b.filaments, "filament"), b.website].filter(Boolean).join(" · "),
                    }))}
                  />
                </TabsContent>
                <TabsContent value="vendors" className="min-w-0 pt-2">
                  <CatalogEditor
                    kind="vendors"
                    singular="shop"
                    usageNoun="spool"
                    fields={VENDOR_FIELDS}
                    rows={vendors.map((v) => ({
                      id: v.id,
                      values: v,
                      usage: v.spools,
                      detail: [plural(v.spools, "spool"), v.url].filter(Boolean).join(" · "),
                    }))}
                  />
                </TabsContent>
                <TabsContent value="locations" className="min-w-0 pt-2">
                  <LocationsEditor locations={locations} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Changing it signs out your other devices.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <LogoutEverywhereButton sessions={sessionCount} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup</CardTitle>
            </CardHeader>
            <CardContent>
              <BackupCard />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
