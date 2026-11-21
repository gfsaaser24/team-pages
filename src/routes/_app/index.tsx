import { Link, createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { FileText, Plus, Table2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { formatTime } from "@/client/lib/format";
import { createPage } from "@/serverFunctions/pages";

export const Route = createFileRoute("/_app/")({ component: Home });

const layout = getRouteApi("/_app");

function Home() {
  const tree = layout.useLoaderData();
  const navigate = useNavigate();
  const [pending, setPending] = useState<"page" | "database" | null>(null);
  const recent = [...tree].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);

  async function create(kind: "page" | "database") {
    setPending(kind);
    try {
      const { id } = await createPage({ data: { parentId: null, kind } });
      await navigate({ to: "/p/$pageId", params: { pageId: id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create it");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Pages"
        actions={
          <>
            <Button data-testid="new-page" pending={pending === "page"} onClick={() => create("page")}>
              <Plus data-icon="inline-start" />
              New page
            </Button>
            <Button
              variant="outline"
              data-testid="new-database"
              pending={pending === "database"}
              onClick={() => create("database")}
            >
              <Table2 data-icon="inline-start" />
              New database
            </Button>
          </>
        }
      />
      {recent.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Recently edited</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  to="/p/$pageId"
                  params={{ pageId: p.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  {p.icon ? (
                    <span aria-hidden>{p.icon}</span>
                  ) : p.kind === "database" ? (
                    <Table2 className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{p.title || "Untitled"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatTime(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState title="No pages yet" description="Create a page or a database and it will appear here." />
      )}
    </>
  );
}
