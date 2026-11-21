import { Link, Outlet, createFileRoute, useMatches } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { PageTree } from "@/client/features/PageTree";
import { TreeRenameContext } from "@/client/features/treeOverrides";
import { getTree } from "@/serverFunctions/pages";

export const Route = createFileRoute("/_app")({
  loader: () => getTree(),
  component: Layout,
});

const NAV = "text-sm text-muted-foreground transition-colors hover:text-foreground";

function Layout() {
  const loaded = Route.useLoaderData();
  const [renamed, setRenamed] = useState<Record<string, { title: string; icon: string | null }>>({});
  const tree = loaded.map((t) => (renamed[t.id] ? { ...t, ...renamed[t.id] } : t));
  const rename = useCallback(
    (id: string, title: string, icon: string | null) =>
      setRenamed((r) => ({ ...r, [id]: { title, icon } })),
    [],
  );
  const wide = useMatches({ select: (m) => m.some((x) => x.routeId === "/_app/p/$pageId") });
  return (
    <TreeRenameContext.Provider value={rename}>
    <AppShell
      wide={wide}
      sidebar={<PageTree items={tree} />}
      nav={
        <>
          <Link to="/" className={NAV} activeProps={{ className: "text-foreground" }} activeOptions={{ exact: true }}>
            Pages
          </Link>
          <Link to="/search" className={NAV} activeProps={{ className: "text-foreground" }}>
            Search
          </Link>
          <Link to="/trash" className={NAV} activeProps={{ className: "text-foreground" }}>
            Trash
          </Link>
        </>
      }
    >
      <Outlet />
    </AppShell>
    </TreeRenameContext.Provider>
  );
}
