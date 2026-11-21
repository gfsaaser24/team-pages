import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Input } from "@/client/components/ui/input";
import { formatTime } from "@/client/lib/format";
import { searchPages } from "@/serverFunctions/pages";

export const Route = createFileRoute("/_app/search")({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: ({ deps }) => (deps.q.trim() ? searchPages({ data: { q: deps.q } }) : null),
  component: Search,
});

function Search() {
  const results = Route.useLoaderData();
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [text, setText] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) void navigate({ search: { q: text || undefined }, replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [text, q, navigate]);

  return (
    <>
      <PageHeader title="Search" />
      <Input
        type="search"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search titles and text"
        aria-label="Search"
        data-testid="search-input"
      />
      {results === null ? null : results.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {results.map((r) => (
            <li key={r.id} data-testid="search-result">
              <Link to="/p/$pageId" params={{ pageId: r.id }} className="block space-y-1 px-4 py-3 hover:bg-muted/50">
                <div className="flex items-center gap-2 font-medium">
                  {r.icon ? <span aria-hidden>{r.icon}</span> : <FileText className="size-4 text-muted-foreground" aria-hidden />}
                  {r.title || "Untitled"}
                </div>
                {r.excerpt ? <p className="truncate text-sm text-muted-foreground">{r.excerpt}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {r.path.length ? `${r.path.join(" / ")} · ` : ""}Edited {formatTime(r.updatedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div data-testid="search-empty">
          <EmptyState kind="filtered" title={`Nothing matched “${q}”`} />
        </div>
      )}
    </>
  );
}
