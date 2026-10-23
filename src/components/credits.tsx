import { GlobeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/jsemolik/spooldeck";
export const AUTHOR_NAME = "Oliver Steiner";

/** The author's website, tagged so visits from Spooldeck show up in analytics. `placement` tells the links apart. */
export function authorUrl(placement: string) {
  const params = new URLSearchParams({
    utm_source: "spooldeck",
    utm_medium: "referral",
    utm_campaign: "spooldeck",
    utm_content: placement,
  });
  return `https://jsemolik.dev/?${params}`;
}

// lucide no longer ships brand icons, so the GitHub mark is inlined.
export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4", className)}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

/** One-line credit for the bottom of the sidebar. */
export function SidebarCredits() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 px-4 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate">
        Made by{" "}
        <a href={authorUrl("sidebar")} target="_blank" rel="noopener" className="hover:text-foreground underline-offset-2 hover:underline">
          {AUTHOR_NAME}
        </a>
      </span>
      <a href={GITHUB_URL} target="_blank" rel="noopener" aria-label="Spooldeck on GitHub" className="hover:text-foreground">
        <GithubIcon className="size-3.5" />
      </a>
    </div>
  );
}

/** Body of the About card on the Settings page. */
export function AboutCredits() {
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted-foreground">
        Spooldeck is open source, made by{" "}
        <a href={authorUrl("settings")} target="_blank" rel="noopener" className="text-foreground font-medium underline-offset-2 hover:underline">
          {AUTHOR_NAME}
        </a>
        .
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <a href={GITHUB_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline">
          <GithubIcon />
          github.com/jsemolik/spooldeck
        </a>
        <a href={authorUrl("settings")} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline">
          <GlobeIcon className="size-4" />
          jsemolik.dev
        </a>
      </div>
    </div>
  );
}
