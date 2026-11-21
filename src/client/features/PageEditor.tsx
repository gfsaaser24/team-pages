import { Link, useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover";
import { Separator } from "@/client/components/ui/separator";
import { MAX_FILE_BYTES, MAX_FILE_LABEL, TEXT_TYPES, UPLOAD_PART_BYTES, type Block, type BlockType } from "@/lib/model";
import { createPage, savePage } from "@/serverFunctions/pages";
import { useTreeRename } from "./treeOverrides";
import { FileBlock, SubpageIcon, TEXT_CLASS, listNumber, type FileInfo } from "./BlockView";

const ICONS = ["📄", "📝", "📌", "📅", "✅", "💡", "🚀", "📊", "🎯", "📚", "🧭", "🛠️", "🌱", "🏔️", "✈️", "💬"];
const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "todo"];

type Status = "saved" | "dirty" | "saving" | "conflict" | "error";

export interface EditorPage {
  id: string;
  title: string;
  icon: string | null;
  blocks: Block[];
  version: number;
}

export function PageEditor({
  page,
  canEdit,
  canComment,
  subpages,
  files,
  actions,
  backLink,
  showBlocks,
  beforeBlocks,
  afterTitle,
  onComment,
  onReload,
}: {
  page: EditorPage;
  canEdit: boolean;
  canComment: boolean;
  subpages: Record<string, { title: string; icon: string | null }>;
  files: Record<string, FileInfo>;
  actions: ReactNode;
  backLink: ReactNode;
  showBlocks: boolean;
  beforeBlocks?: ReactNode;
  afterTitle?: ReactNode;
  onComment: (block: Block) => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const rename = useTreeRename();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [blocks, setBlocks] = useState(page.blocks);
  const [status, setStatus] = useState<Status>("saved");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [extraFiles, setExtraFiles] = useState<Record<string, FileInfo>>({});
  const [uploading, setUploading] = useState(false);
  /** 0 to 100 while a large file goes up in parts, else null. */
  const [progress, setProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const state = useRef({ title, icon, blocks });
  const version = useRef(page.version);
  const saved = useRef({ title: page.title, icon: page.icon });
  const inFlight = useRef(false);
  const again = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (stopped.current) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    const sent = state.current;
    try {
      const res = await savePage({
        data: { id: page.id, baseVersion: version.current, ...sent },
      });
      inFlight.current = false;
      if (res.conflict) {
        stopped.current = true;
        setStatus("conflict");
        return;
      }
      version.current = res.version;
      if (sent.title !== saved.current.title || sent.icon !== saved.current.icon) {
        saved.current = { title: sent.title, icon: sent.icon };
        rename(page.id, sent.title, sent.icon);
      }
      if (again.current || state.current !== sent) {
        again.current = false;
        void flush();
      } else setStatus("saved");
    } catch (error) {
      inFlight.current = false;
      setStatus("error");
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    }
  }, [page.id, rename]);

  // Leaving the page saves what is still waiting.
  useEffect(
    () => () => {
      if (timer.current !== undefined && !stopped.current) void flush();
    },
    [flush],
  );

  function update(next: Partial<{ title: string; icon: string | null; blocks: Block[] }>, now = false) {
    if (!canEdit || stopped.current) return;
    state.current = { ...state.current, ...next };
    if (next.title !== undefined) setTitle(next.title);
    if (next.icon !== undefined) setIcon(next.icon);
    if (next.blocks) setBlocks(next.blocks);
    setStatus("dirty");
    clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), 500);
  }

  const setBlock = (id: string, change: Partial<Block>, now = false) =>
    update({ blocks: state.current.blocks.map((b) => (b.id === id ? { ...b, ...change } : b)) }, now);

  function insertAfter(index: number, block: Block) {
    const list = [...state.current.blocks];
    list.splice(index + 1, 0, block);
    update({ blocks: list }, true);
    setFocusId(block.id);
  }

  function remove(id: string) {
    update({ blocks: state.current.blocks.filter((b) => b.id !== id) }, true);
  }

  function move(index: number, by: -1 | 1) {
    const list = [...state.current.blocks];
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to]!, list[index]!];
    update({ blocks: list }, true);
  }

  async function addBlock(type: BlockType | "subpage" | "file") {
    const end = state.current.blocks.length - 1;
    if (type === "file") {
      fileInput.current?.click();
      return;
    }
    if (type === "subpage") {
      try {
        const { id } = await createPage({ data: { parentId: page.id, kind: "page" } });
        insertAfter(end, { id: crypto.randomUUID(), type: "subpage", text: "", ref: id });
        await router.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't add the page");
      }
      return;
    }
    insertAfter(end, { id: crypto.randomUUID(), type, text: "", ...(type === "todo" ? { checked: false } : {}) });
  }

  async function upload(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`Files can be up to ${MAX_FILE_LABEL}`);
      return;
    }
    setUploading(true);
    try {
      const body = file.size > UPLOAD_PART_BYTES ? await uploadInParts(file) : await uploadWhole(file);
      setExtraFiles((f) => ({ ...f, [body.id]: body }));
      insertAfter(state.current.blocks.length - 1, { id: crypto.randomUUID(), type: "file", text: body.name, ref: body.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function uploadWhole(file: File): Promise<FileInfo> {
    const form = new FormData();
    form.set("pageId", page.id);
    form.set("file", file);
    return readJson<FileInfo>(await fetch("/api/files", { method: "POST", body: form }));
  }

  /** Sends a large file in parts of UPLOAD_PART_BYTES, one request each; cancels it on any failure. */
  async function uploadInParts(file: File): Promise<FileInfo> {
    const start = await readJson<{ id: string; parts: number }>(
      await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId: page.id, name: file.name, contentType: file.type, size: file.size }),
      }),
    );
    try {
      const parts: { partNumber: number; etag: string }[] = [];
      setProgress(0);
      for (let n = 1; n <= start.parts; n++) {
        const chunk = file.slice((n - 1) * UPLOAD_PART_BYTES, n * UPLOAD_PART_BYTES);
        parts.push(await readJson(await fetch(`/api/files/${start.id}?part=${n}`, { method: "PUT", body: chunk })));
        setProgress(Math.round((n / start.parts) * 100));
      }
      return await readJson<FileInfo>(
        await fetch(`/api/files/${start.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parts }),
        }),
      );
    } catch (error) {
      void fetch(`/api/files/${start.id}`, { method: "DELETE" }).catch(() => {});
      throw error;
    }
  }

  const allFiles = { ...files, ...extraFiles };

  return (
    <div className="space-y-6">
      <PageHeader
        backLink={backLink}
        actions={actions}
        title={
          <div className="space-y-2">
            <IconPicker icon={icon} canEdit={canEdit} onChange={(i) => update({ icon: i }, true)} />
            <input
              data-testid="page-title"
              aria-label="Title"
              value={title}
              readOnly={!canEdit}
              placeholder="Untitled"
              onChange={(e) => update({ title: e.target.value })}
              className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        }
        description={
          canEdit ? (
            <span data-testid="save-status">
              {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Not saved" : status === "error" ? "Not saved" : "Unsaved changes"}
            </span>
          ) : null
        }
      />
      {afterTitle}
      {status === "conflict" ? (
        <Alert data-testid="conflict" variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Someone else saved this page after you opened it. Reload to see their version; your latest edits here won't be saved.
            <Button size="sm" variant="outline" onClick={onReload}>
              Reload
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {beforeBlocks}
      {showBlocks ? (
        <div className="space-y-1">
          {blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              index={i}
              blocks={blocks}
              canEdit={canEdit}
              canComment={canComment}
              focus={focusId === b.id}
              subpage={b.ref ? subpages[b.ref] : undefined}
              file={b.ref ? allFiles[b.ref] : undefined}
              onChange={(change, now) => setBlock(b.id, change, now)}
              onEnter={() =>
                insertAfter(i, {
                  id: crypto.randomUUID(),
                  type: LIST_TYPES.includes(b.type) ? b.type : "paragraph",
                  text: "",
                  ...(b.type === "todo" ? { checked: false } : {}),
                })
              }
              onBackspaceEmpty={() => {
                if (i > 0) setFocusId(blocks[i - 1]!.id);
                remove(b.id);
              }}
              onMove={(by) => move(i, by)}
              onDelete={() => remove(b.id)}
              onComment={() => onComment(b)}
            />
          ))}
          {canEdit ? (
            <div className="pt-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" data-testid="add-block" pending={uploading}>
                      <Plus data-icon="inline-start" />
                      {progress === null ? "Add block" : `Uploading ${progress}%`}
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuGroup>
                    {TEXT_TYPES.map((t) => (
                      <DropdownMenuItem key={t.type} onClick={() => addBlock(t.type)}>
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => addBlock("divider")}>Divider</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addBlock("subpage")}>Sub-page</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addBlock("file")}>Image or file</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconPicker({
  icon,
  canEdit,
  onChange,
}: {
  icon: string | null;
  canEdit: boolean;
  onChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return icon ? <div className="text-4xl">{icon}</div> : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid="icon-button"
            className={cn(
              "rounded-md hover:bg-muted",
              icon ? "text-4xl" : "px-2 py-1 text-sm font-normal text-muted-foreground",
            )}
          >
            {icon ?? "Add icon"}
          </button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="grid grid-cols-8 gap-1">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              data-testid="icon-option"
              className="rounded p-1 text-xl hover:bg-muted"
              onClick={() => {
                onChange(i);
                setOpen(false);
              }}
            >
              {i}
            </button>
          ))}
        </div>
        {icon ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Remove icon
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function BlockRow({
  block,
  index,
  blocks,
  canEdit,
  canComment,
  focus,
  subpage,
  file,
  onChange,
  onEnter,
  onBackspaceEmpty,
  onMove,
  onDelete,
  onComment,
}: {
  block: Block;
  index: number;
  blocks: Block[];
  canEdit: boolean;
  canComment: boolean;
  focus: boolean;
  subpage: { title: string; icon: string | null } | undefined;
  file: FileInfo | undefined;
  onChange: (change: Partial<Block>, now?: boolean) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
  onComment: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const isText = TEXT_TYPES.some((t) => t.type === block.type);

  let body: ReactNode;
  if (block.type === "divider") body = <Separator className="my-3" />;
  else if (block.type === "subpage")
    body = subpage ? (
      <Link
        to="/p/$pageId"
        params={{ pageId: block.ref! }}
        data-testid="subpage-link"
        className="inline-flex items-center gap-2 rounded-md px-1 py-1 underline decoration-border underline-offset-4 hover:bg-muted"
      >
        <SubpageIcon icon={subpage.icon} />
        {subpage.title || "Untitled"}
      </Link>
    ) : (
      <span className="text-sm text-muted-foreground">Page unavailable</span>
    );
  else if (block.type === "file")
    body = <FileBlock file={file} href={block.ref ? `/api/files/${block.ref}` : null} />;
  else
    body = (
      <div className="flex items-start gap-2">
        {block.type === "bulleted" ? <span className="leading-7" aria-hidden>•</span> : null}
        {block.type === "numbered" ? <span className="leading-7">{listNumber(blocks, index)}.</span> : null}
        {block.type === "todo" ? (
          <Checkbox
            data-testid="block-check"
            className="mt-1.5"
            aria-label="Done"
            checked={!!block.checked}
            disabled={!canEdit}
            onCheckedChange={(c) => onChange({ checked: !!c }, true)}
          />
        ) : null}
        <textarea
          ref={ref}
          data-testid="block-text"
          aria-label="Block text"
          rows={1}
          value={block.text}
          readOnly={!canEdit}
          placeholder={canEdit ? "Type something" : undefined}
          onChange={(e) => onChange({ text: e.target.value })}
          onKeyDown={(e) => {
            if (!canEdit) return;
            if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
              e.preventDefault();
              onEnter();
            } else if (e.key === "Backspace" && block.text === "" && blocks.length > 1) {
              e.preventDefault();
              onBackspaceEmpty();
            }
          }}
          className={cn(
            "w-full resize-none bg-transparent leading-7 outline-none [field-sizing:content] placeholder:text-muted-foreground/0 focus:placeholder:text-muted-foreground/60",
            TEXT_CLASS[block.type],
            block.checked && "text-muted-foreground line-through",
          )}
        />
      </div>
    );

  return (
    <div data-testid="block" data-type={block.type} className="group relative flex items-start gap-1">
      {canEdit || canComment ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                data-testid={canEdit ? "block-menu" : "block-comment-menu"}
                aria-label="Block actions"
                className="mt-1 rounded p-0.5 text-muted-foreground opacity-40 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
              >
                <GripVertical className="size-4" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-48">
            {canEdit && isText ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Turn into</DropdownMenuLabel>
                {TEXT_TYPES.map((t) => (
                  <DropdownMenuItem key={t.type} onClick={() => onChange({ type: t.type }, true)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
            {canEdit && isText ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              {canEdit ? (
                <>
                  <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
                    <ArrowUp />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={index === blocks.length - 1} onClick={() => onMove(1)}>
                    <ArrowDown />
                    Move down
                  </DropdownMenuItem>
                </>
              ) : null}
              {canComment ? (
                <DropdownMenuItem onClick={onComment}>
                  <MessageSquare />
                  Comment
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

/** A JSON answer from the app's API, or its error message as a thrown Error. */
async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Upload failed");
  return body;
}
