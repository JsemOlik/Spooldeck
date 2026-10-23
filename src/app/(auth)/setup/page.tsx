import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Setup" };

export default async function SetupPage() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  if (count > 0) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Spooldeck</CardTitle>
        <CardDescription>Create the single account that will own this instance.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetupForm />
      </CardContent>
    </Card>
  );
}
