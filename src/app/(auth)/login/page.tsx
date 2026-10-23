import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeNext } from "@/lib/action-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  if (count === 0) redirect("/setup");
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to your filament shelf.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={typeof next === "string" ? safeNext(next) : undefined} />
      </CardContent>
    </Card>
  );
}
