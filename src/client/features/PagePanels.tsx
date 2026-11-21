import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/client/components/CopyButton";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/client/components/ui/sheet";
import { Textarea } from "@/client/components/ui/textarea";
import { formatTime } from "@/client/lib/format";
import { LEVELS, LEVEL_LABELS, type Block, type Level } from "@/lib/model";
import {
  addComment,
  deleteComment,
  getComments,
  getPublication,
  getSharing,
  getVersions,
  publishPage,
  removeGrant,
  resolveComment,
  restoreVersion,
  setGrant,
  setPublicationExpiry,
  unpublishPage,
} from "@/serverFunctions/collab";
import { movePage } from "@/serverFunctions/pages";
import { BlockView } from "./BlockView";
import type { TreeItem } from "./PageTree";

const fail = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Something went wrong");

const LEVEL_OPTIONS = [...LEVELS].reverse().map((l) => ({ value: l, label: LEVEL_LABELS[l] }));
const EVERYONE = "Everyone in the workspace";

type Sharing = Awaited<ReturnType<typeof getSharing>>;

export function ShareDialog({ pageId, me, onClose }: { pageId: string; me: string; onClose: () => void }) {
  const [data, setData] = useState<Sharing | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>("view");
  const [busy, setBusy] = useState(false);
  const load = () => getSharing({ data: { pageId } }).then(setData, fail);
  useEffect(() => {
    void load();
  }, [pageId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const people = [
    { value: "*", label: EVERYONE },
    ...(data?.people ?? []).filter((p) => p.id !== me).map((p) => ({ value: p.id, label: p.email })),
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Access applies to sub-pages and database rows too.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <SimpleSelect testId="share-who" label="Person" value={who} onChange={setWho} options={people} placeholder="Choose a person" className="min-w-0 flex-1" size="default" />
          <SimpleSelect testId="share-level" label="Access" value={level} onChange={(v) => setLevel(v as Level)} options={LEVEL_OPTIONS} size="default" />
          <Button disabled={!who} pending={busy} onClick={() => who && run(() => setGrant({ data: { pageId, subject: who, level } }))}>
            Add
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {data?.owner ? (
            <li className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate">{data.owner}</span>
              <span className="text-muted-foreground">Owner</span>
            </li>
          ) : null}
          {data?.grants.map((g) => (
            <li key={g.subject} data-testid="grant" className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{g.subject === "*" ? EVERYONE : (g.email ?? "Former member")}</span>
              <SimpleSelect
                testId="grant-level"
                label="Access"
                value={g.level}
                options={LEVEL_OPTIONS}
                onChange={(v) => run(() => setGrant({ data: { pageId, subject: g.subject, level: v as Level } }))}
              />
              <Button size="sm" variant="ghost" onClick={() => run(() => removeGrant({ data: { pageId, subject: g.subject } }))}>
                Remove
              </Button>
            </li>
          ))}
          {data?.inherited.map((g, i) => (
            <li key={`${g.subject}-${i}`} className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{g.subject === "*" ? EVERYONE : (g.email ?? "Former member")}</span>
              <span>
                {LEVEL_LABELS[g.level]} from {g.from || "Untitled"}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PublishDialog({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [pub, setPub] = useState<{ slug: string; expiresAt: string | null } | null | undefined>(undefined);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getPublication({ data: { pageId } }).then((p) => {
      setPub(p);
      setExpiry(toLocalInput(p?.expiresAt ?? null));
    }, fail);
  }, [pageId]);

  async function run(action: () => Promise<{ slug: string; expiresAt: string | null } | null>) {
    setBusy(true);
    try {
      const p = await action();
      setPub(p);
      setExpiry(toLocalInput(p?.expiresAt ?? null));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const url = pub ? `${window.location.origin}/s/${pub.slug}` : "";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to the web</DialogTitle>
          <DialogDescription>
            Anyone with the link can read this page and its sub-pages, without comments.
          </DialogDescription>
        </DialogHeader>
        {pub === undefined ? null : pub ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input data-testid="publish-link" readOnly value={url} aria-label="Public link" />
              <CopyButton value={url} successMessage="Link copied" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry">Expires</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="expiry"
                  type="datetime-local"
                  data-testid="publish-expiry"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-auto"
                />
                <Button
                  variant="outline"
                  pending={busy}
                  onClick={() =>
                    run(() =>
                      setPublicationExpiry({
                        data: { pageId, expiresAt: expiry ? new Date(expiry).toISOString() : null },
                      }),
                    )
                  }
                >
                  Save expiry
                </Button>
              </div>
              <p data-testid="publish-expiry-current" className="text-sm text-muted-foreground">
                {pub.expiresAt ? `Link stops working ${formatTime(pub.expiresAt)}` : "No expiry"}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                pending={busy}
                onClick={() =>
                  run(async () => {
                    await unpublishPage({ data: { pageId } });
                    return null;
                  })
                }
              >
                Unpublish
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <Button pending={busy} onClick={() => run(() => publishPage({ data: { pageId } }))}>
              Publish
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Comment = Awaited<ReturnType<typeof getComments>>[number];

export function CommentsSheet({
  pageId,
  blocks,
  target,
  canComment,
  onClearTarget,
  onClose,
}: {
  pageId: string;
  blocks: Block[];
  target: Block | null;
  canComment: boolean;
  onClearTarget: () => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => getComments({ data: { pageId } }).then(setList, fail);
  useEffect(() => {
    void load();
  }, [pageId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  const blockText = (id: string | null) => {
    if (!id) return null;
    const b = blocks.find((x) => x.id === id);
    return b ? b.text || "Untitled block" : "Removed block";
  };
  const open = list.filter((c) => !c.resolvedAt);
  const resolved = list.filter((c) => c.resolvedAt);
  const shown = showResolved ? list : open;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-testid="comments-panel" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {canComment ? (
            <div className="space-y-2">
              {target ? (
                <div data-testid="comment-target" className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="truncate">On “{target.text || "Untitled block"}”</span>
                  <Button size="xs" variant="ghost" onClick={onClearTarget}>
                    Clear
                  </Button>
                </div>
              ) : null}
              <Textarea
                data-testid="comment-input"
                aria-label="Comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={target ? "Comment on this block" : "Comment on this page"}
              />
              <Button
                size="sm"
                disabled={!text.trim()}
                pending={busy}
                onClick={() =>
                  run(async () => {
                    await addComment({ data: { pageId, blockId: target?.id ?? null, body: text } });
                    setText("");
                    onClearTarget();
                  })
                }
              >
                Comment
              </Button>
            </div>
          ) : null}
          {resolved.length ? (
            <Button size="sm" variant="ghost" data-testid="show-resolved" onClick={() => setShowResolved(!showResolved)}>
              {showResolved ? "Hide resolved" : `Show resolved (${resolved.length})`}
            </Button>
          ) : null}
          {shown.length ? (
            <ul className="space-y-3">
              {shown.map((c) => (
                <li key={c.id} data-testid="comment" className="space-y-1 rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span data-testid="comment-author" className="font-medium">{c.author}</span>
                    <time dateTime={c.createdAt} className="text-xs text-muted-foreground">{formatTime(c.createdAt)}</time>
                  </div>
                  {c.blockId ? (
                    <p className="truncate border-l-2 border-border pl-2 text-xs text-muted-foreground">{blockText(c.blockId)}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <div className="flex gap-1 pt-1">
                    {c.canResolve ? (
                      <Button size="xs" variant="outline" onClick={() => run(() => resolveComment({ data: { id: c.id, resolved: !c.resolvedAt } }))}>
                        {c.resolvedAt ? "Reopen" : "Resolve"}
                      </Button>
                    ) : null}
                    {c.canDelete ? (
                      <Button size="xs" variant="ghost" onClick={() => run(() => deleteComment({ data: { id: c.id } }))}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open comments.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Version = Awaited<ReturnType<typeof getVersions>>[number];

export function HistorySheet({ pageId, onRestored, onClose }: { pageId: string; onRestored: () => void; onClose: () => void }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getVersions({ data: { pageId } }).then(setList, fail);
  useEffect(() => {
    void load();
  }, [pageId]);
  const version = list?.find((v) => v.id === selected);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent data-testid="history-panel" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {list && !list.length ? <p className="text-sm text-muted-foreground">No versions in the last 30 days.</p> : null}
          <ul className="space-y-1">
            {list?.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  data-testid="version"
                  onClick={() => setSelected(v.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${v.id === selected ? "bg-muted" : ""}`}
                >
                  <div className="font-medium">{formatTime(v.savedAt)}</div>
                  <div className="text-xs text-muted-foreground">{v.author}</div>
                </button>
              </li>
            ))}
          </ul>
          {version ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div data-testid="version-preview" className="space-y-3">
                <h2 className="text-xl font-semibold">
                  {version.icon ? `${version.icon} ` : ""}
                  {version.title || "Untitled"}
                </h2>
                <BlockView
                  blocks={version.blocks}
                  files={{}}
                  fileHref={(id) => `/api/files/${id}`}
                  subpageLink={() => <span className="text-sm text-muted-foreground">Sub-page</span>}
                />
              </div>
              <Button
                pending={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await restoreVersion({ data: { pageId, versionId: version.id } });
                    toast.success("Version restored");
                    await load();
                    onRestored();
                  } catch (error) {
                    fail(error);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Restore this version
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MoveDialog({
  pageId,
  tree,
  canTop,
  onClose,
}: {
  pageId: string;
  tree: TreeItem[];
  canTop: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inside = new Set([pageId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tree)
      if (t.parentId && inside.has(t.parentId) && !inside.has(t.id)) {
        inside.add(t.id);
        grew = true;
      }
  }
  const options = [
    ...(canTop ? [{ value: "top", label: "Top level" }] : []),
    ...tree.filter((t) => t.kind === "page" && !inside.has(t.id)).map((t) => ({ value: t.id, label: t.title || "Untitled" })),
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to</DialogTitle>
        </DialogHeader>
        <SimpleSelect testId="move-target" label="New parent" value={target} onChange={setTarget} options={options} placeholder="Choose a page" size="default" className="w-full" />
        <DialogFooter>
          <Button
            disabled={!target}
            pending={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await movePage({ data: { id: pageId, parentId: target === "top" ? null : target } });
                await router.invalidate();
                onClose();
              } catch (error) {
                fail(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
