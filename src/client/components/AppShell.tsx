import { useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";

/**
 * The frame every page sits in: a bar with the way back to the Gateway and
 * the theme pick, an optional sidebar, then one scrolling column. A page
 * starts with a `PageHeader`.
 */
export function AppShell({
  nav,
  sidebar,
  wide = false,
  children,
}: {
  nav?: ReactNode;
  sidebar?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  // From the root route's loader (src/serverFunctions/gateway.ts).
  const gatewayUrl = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "gatewayUrl" in root ? root.gatewayUrl : null;
    },
  });
  const column = cn(
    "mx-auto w-full px-4 md:px-10",
    wide ? "max-w-6xl" : "max-w-3xl",
  );
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-4">
            {gatewayUrl ? (
              <a
                href={gatewayUrl}
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All apps
              </a>
            ) : null}
            {nav}
          </div>
          <ThemePreferenceRadio />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebar ? (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 md:block">
            {sidebar}
          </aside>
        ) : null}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <main className={`${column} space-y-8 pt-8 pb-24 md:pt-10`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
