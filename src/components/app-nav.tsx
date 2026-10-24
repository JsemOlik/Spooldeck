"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileUpIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  MoonIcon,
  PackageIcon,
  PaletteIcon,
  PrinterIcon,
  ScanLineIcon,
  SettingsIcon,
  SunIcon,
  TagIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { logoutAction } from "@/actions/auth";
import { SidebarCredits } from "@/components/credits";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/spools", label: "Spools", icon: PackageIcon },
  { href: "/filaments", label: "Filaments", icon: PaletteIcon },
  { href: "/scan", label: "Scan", icon: ScanLineIcon },
  { href: "/log-print", label: "Log print", icon: FileUpIcon },
  { href: "/printers", label: "Printers", icon: PrinterIcon },
  { href: "/labels", label: "Labels", icon: TagIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const MOBILE_ITEMS = ["/", "/spools", "/scan", "/filaments", "/settings"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex h-14 items-center px-4">
        <Link href="/">
          <Logo className="text-lg" />
        </Link>
      </div>
      <nav className="grid gap-0.5 px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              isActive(pathname, href) ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto">
        <SidebarCredits />
      </div>
      <div className="flex items-center gap-1 border-t p-2">
        <span className="text-muted-foreground min-w-0 flex-1 truncate px-2 text-sm">{username}</span>
        <ThemeToggle />
        <form action={logoutAction}>
          <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
            <LogOutIcon />
          </Button>
        </form>
      </div>
    </aside>
  );
}

export function MobileHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-12 items-center justify-between border-b px-4 backdrop-blur md:hidden">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex items-center">
        <Link href="/log-print" aria-label="Log print" className="p-2">
          <FileUpIcon className="size-4" />
        </Link>
        <Link href="/printers" aria-label="Printers" className="p-2">
          <PrinterIcon className="size-4" />
        </Link>
        <Link href="/labels" aria-label="Labels" className="p-2">
          <TagIcon className="size-4" />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {ITEMS.filter((i) => MOBILE_ITEMS.includes(i.href)).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        if (href === "/scan") {
          return (
            <Link key={href} href={href} className="flex flex-col items-center justify-center py-1.5" aria-label={label}>
              <span className="bg-primary text-primary-foreground -mt-5 flex size-12 items-center justify-center rounded-full shadow-lg ring-4 ring-background">
                <Icon className="size-5" />
              </span>
            </Link>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
