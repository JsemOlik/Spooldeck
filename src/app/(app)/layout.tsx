import { MobileHeader, MobileTabBar, Sidebar } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex flex-1">
      <Sidebar username={user.username} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>
        <MobileTabBar />
      </div>
    </div>
  );
}
