import { Link, createFileRoute, getRouteApi, notFound, useRouter } from "@tanstack/react-router";
import { History, MessageSquare, MoreHorizontal, Move, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { DatabaseView } from "@/client/features/DatabaseView";
import { PageEditor } from "@/client/features/PageEditor";
import { CommentsSheet, HistorySheet, MoveDialog, PublishDialog, ShareDialog } from "@/client/features/PagePanels";
import { PropertyInput } from "@/client/features/PropertyInput";
import { atLeast, type Block } from "@/lib/model";
import { archivePage, getPage, restorePage } from "@/serverFunctions/pages";
import { updateRow } from "@/serverFunctions/databases";

export const Route = createFileRoute("/_app/p/$pageId")({
  loader: async ({ params }) => {
    try {
      return await getPage({ data: { id: params.pageId } });
    } catch {
      throw notFound();
    }
  },
  notFoundComponent: () => (
    <div data-testid="no-access">
      <EmptyState kind="error" title="Page not found" description="It may have been deleted, or it hasn't been shared with you." />
    </div>
  ),
  component: PageRoute,
});

const layout = getRouteApi("/_app");

type Panel = "share" | "publish" | "comments" | "history" | "move" | null;

function PageRoute() {
  const loaded = Route.useLoaderData();
  // After a reload or a restore, the page as just fetched, until the route loads again.
  const [fresh, setFresh] = useState<typeof loaded | null>(null);
  const data = fresh && fresh.page.id === loaded.page.id && fresh.page.version >= loaded.page.version ? fresh : loaded;
  const tree = layout.useLoaderData();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [commentOn, setCommentOn] = useState<Block | null>(null);
  const { page, level } = data;
  const archived = !!page.archivedAt;
  const canEdit = atLeast(level, "edit") && !archived;
  const canComment = atLeast(level, "comment") && !archived;
  const full = atLeast(level, "full");

  async function reload() {
    try {
      setFresh(await getPage({ data: { id: page.id } }));
      setReloadKey((k) => k + 1);
      void router.invalidate();
    } catch {
      window.location.reload();
    }
  }

  const actions = (
    <>
      <Button size="sm" variant="ghost" data-testid="comments-button" onClick={() => setPanel("comments")}>
        <MessageSquare data-icon="inline-start" />
        Comments
      </Button>
      {full && !archived ? (
        <>
          <Button size="sm" variant="outline" data-testid="share-button" onClick={() => setPanel("share")}>
            Share
          </Button>
          <Button size="sm" variant="outline" data-testid="publish-button" onClick={() => setPanel("publish")}>
            Publish
          </Button>
        </>
      ) : null}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="icon-sm" variant="ghost" data-testid="page-menu" aria-label="Page actions">
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              {!page.databaseId ? (
                <DropdownMenuItem onClick={() => setPanel("move")}>
                  <Move />
                  Move to
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => setPanel("history")}>
                <History />
                Version history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  try {
                    await archivePage({ data: { id: page.id } });
                    await router.invalidate();
                    toast.success("Moved to Trash");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Couldn't move it to Trash");
                  }
                }}
              >
                <Trash2 />
                Move to Trash
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );

  const backLink = data.breadcrumb.length ? (
    <nav data-testid="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      {data.breadcrumb.map((b, i) => (
        <span key={b.id} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden>/</span> : null}
          <Link to="/p/$pageId" params={{ pageId: b.id }} className="hover:text-foreground">
            {b.icon ? `${b.icon} ` : ""}
            {b.title || "Untitled"}
          </Link>
        </span>
      ))}
    </nav>
  ) : null;

  const rowProps = data.rowProperties;
  return (
    <>
      <PageEditor
        key={`${page.id}:${reloadKey}`}
        page={page}
        canEdit={canEdit}
        canComment={canComment}
        subpages={data.subpages}
        files={data.files}
        actions={actions}
        backLink={backLink}
        showBlocks={page.kind === "page"}
        onComment={(b) => {
          setCommentOn(b);
          setPanel("comments");
        }}
        onReload={reload}
        afterTitle={
          archived ? (
            <Alert data-testid="archived-banner">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                This page is in Trash.
                {atLeast(level, "edit") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await restorePage({ data: { id: page.id } });
                      await reload();
                    }}
                  >
                    Restore
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null
        }
        beforeBlocks={
          rowProps ? (
            <dl data-testid="row-properties" className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-4 gap-y-1 border-b border-border pb-4 text-sm">
              {rowProps.map((p) => (
                <div key={p.id} className="contents">
                  <dt className="text-muted-foreground">{p.name}</dt>
                  <dd>
                    <PropertyInput
                      property={p}
                      value={page.props[p.id]}
                      people={data.people}
                      canEdit={canEdit}
                      testId={`prop-${p.name}`}
                      onChange={async (v) => {
                        try {
                          await updateRow({ data: { id: page.id, props: { [p.id]: v } } });
                          await router.invalidate();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Couldn't save");
                        }
                      }}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          ) : data.database ? (
            <DatabaseView databaseId={page.id} data={data.database} people={data.people} canEdit={canEdit} />
          ) : null
        }
      />
      {panel === "share" ? <ShareDialog pageId={page.id} me={data.me} onClose={() => setPanel(null)} /> : null}
      {panel === "publish" ? <PublishDialog pageId={page.id} onClose={() => setPanel(null)} /> : null}
      {panel === "comments" ? (
        <CommentsSheet
          pageId={page.id}
          blocks={page.blocks}
          target={commentOn}
          canComment={canComment}
          onClearTarget={() => setCommentOn(null)}
          onClose={() => {
            setPanel(null);
            setCommentOn(null);
          }}
        />
      ) : null}
      {panel === "history" ? <HistorySheet pageId={page.id} onRestored={reload} onClose={() => setPanel(null)} /> : null}
      {panel === "move" ? (
        <MoveDialog pageId={page.id} tree={tree} canTop={full} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}
