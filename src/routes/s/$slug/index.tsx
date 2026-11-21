import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/client/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { BlockView, SubpageIcon } from "@/client/features/BlockView";
import { getPublished } from "@/serverFunctions/public";

// Public: a published page, read-only, for anyone with the link.
export const Route = createFileRoute("/s/$slug/")({
  validateSearch: z.object({ p: z.string().optional() }),
  loaderDeps: ({ search }) => ({ p: search.p }),
  loader: async ({ params, deps }) => {
    const p = deps.p && /^[0-9a-f-]{36}$/.test(deps.p) ? deps.p : undefined;
    if (deps.p && !p) throw notFound();
    const data = await getPublished({ data: { slug: params.slug, p } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.page.title || "Untitled" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: () => (
    <Frame>
      <PageHeader title="Page not found" />
    </Frame>
  ),
  component: PublicPage,
});

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-10 pb-24 md:px-10">{children}</main>
    </div>
  );
}

function PublicPage() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  const href = (id: string) => `/s/${slug}?p=${id}`;
  const rootHref = `/s/${slug}`;
  return (
    <Frame>
      <PageHeader
        backLink={
          data.trail.length ? (
            <nav className="flex flex-wrap gap-1 text-sm text-muted-foreground">
              {data.trail.map((t, i) => (
                <span key={t.id} className="flex gap-1">
                  {i > 0 ? <span aria-hidden>/</span> : null}
                  <a href={i === 0 ? rootHref : href(t.id)} className="hover:text-foreground">
                    {t.title || "Untitled"}
                  </a>
                </span>
              ))}
            </nav>
          ) : null
        }
        title={
          <>
            {data.page.icon ? <span className="mr-2">{data.page.icon}</span> : null}
            {data.page.title || "Untitled"}
          </>
        }
      />
      {data.database ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {data.database.columns.map((c, i) => (
                  <TableHead key={i}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.database.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <a href={href(r.id)} className="font-medium hover:underline">
                      {r.title || "Untitled"}
                    </a>
                  </TableCell>
                  {r.cells.map((c, i) => (
                    <TableCell key={i}>{c}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <BlockView
          blocks={data.page.blocks}
          files={data.files}
          fileHref={(id) => `/s/${slug}/files/${id}`}
          subpageLink={(id) => {
            const s = data.subpages[id];
            return s ? (
              <a href={href(id)} className="inline-flex items-center gap-2 underline decoration-border underline-offset-4">
                <SubpageIcon icon={s.icon} />
                {s.title || "Untitled"}
              </a>
            ) : null;
          }}
        />
      )}
    </Frame>
  );
}
