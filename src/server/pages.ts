import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import {
  comments,
  files,
  grants,
  pageVersions,
  pages,
  properties,
  publications,
  views,
} from "@/db/schema";
import {
  BLOCK_TYPES,
  HISTORY_DAYS,
  atLeast,
  blocksText,
  withinSnapshotWindow,
  type Block,
  type Value,
} from "@/lib/model";
import {
  AppError,
  breadcrumb,
  descendants,
  listUsers,
  loadWorkspace,
  notFound,
  requireLevel,
  type Actor,
} from "./access";
import { DEFAULT_STATUS_OPTIONS } from "./databases";

const id = z.string().uuid();
const blockSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(BLOCK_TYPES),
    text: z.string().max(20000),
    checked: z.boolean().optional(),
    ref: z.string().max(64).optional(),
  })
  .strict();

export const createPageInput = z
  .object({
    parentId: id.nullable(),
    kind: z.enum(["page", "database"]),
    title: z.string().max(500).optional(),
  })
  .strict();
export const savePageInput = z
  .object({
    id,
    baseVersion: z.number().int(),
    title: z.string().max(500),
    icon: z.string().max(16).nullable(),
    blocks: z.array(blockSchema).max(2000),
  })
  .strict();
export const pageIdInput = z.object({ id }).strict();
export const moveInput = z.object({ id, parentId: id.nullable() }).strict();
export const searchInput = z.object({ q: z.string().max(200) }).strict();

function parseBlocks(json: string): Block[] {
  try {
    return JSON.parse(json) as Block[];
  } catch {
    return [];
  }
}

export async function getTree(actor: Actor) {
  const ws = await loadWorkspace(actor);
  const visible = [...ws.nodes.values()].filter(
    (n) => ws.levels.get(n.id) && !n.archivedAt && !n.databaseId,
  );
  const ids = new Set(visible.map((n) => n.id));
  return visible
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
    .map((n) => ({
      id: n.id,
      title: n.title,
      icon: n.icon,
      kind: n.kind,
      parentId: n.parentId && ids.has(n.parentId) ? n.parentId : null,
      shared: ws.shared.has(n.id) || n.ownerId !== actor.id,
      updatedAt: n.updatedAt,
    }));
}

export async function createPage(
  actor: Actor,
  input: z.infer<typeof createPageInput>,
) {
  if (input.parentId) await requireLevel(actor, input.parentId, "edit");
  const pageId = crypto.randomUUID();
  const ops: any[] = [
    db.insert(pages).values({
      id: pageId,
      parentId: input.parentId,
      ownerId: actor.id,
      kind: input.kind,
      title: input.title ?? "",
      position: Date.now(),
      updatedBy: actor.id,
    }),
  ];
  if (input.kind === "database") {
    ops.push(
      db.insert(properties).values({
        id: crypto.randomUUID(),
        databaseId: pageId,
        name: "Status",
        type: "status",
        options: JSON.stringify(DEFAULT_STATUS_OPTIONS()),
        position: 0,
      }),
      db.insert(views).values({
        id: crypto.randomUUID(),
        databaseId: pageId,
        name: "Table",
        layout: "table",
        position: 0,
      }),
    );
  }
  await db.batch(ops as [any, ...any[]]);
  return { id: pageId };
}

export async function getPage(actor: Actor, pageId: string) {
  const ws = await loadWorkspace(actor);
  const level = ws.levels.get(pageId);
  if (!level) throw notFound();
  const [page] = await db.select().from(pages).where(eq(pages.id, pageId));
  if (!page) throw notFound();
  const blocks = parseBlocks(page.blocks);
  // Every live child the caller can open, so a link added before the next save resolves.
  const subpages = Object.fromEntries(
    [...ws.nodes.values()]
      .filter((n) => n.parentId === pageId && !n.databaseId && ws.levels.get(n.id) && !n.archivedAt)
      .map((n) => [n.id, { title: n.title, icon: n.icon }]),
  );
  const fileIds = blocks.filter((b) => b.type === "file" && b.ref).map((b) => b.ref!);
  const fileRows = fileIds.length
    ? await db
        .select({ id: files.id, name: files.name, contentType: files.contentType, size: files.size })
        .from(files)
        .where(and(inArray(files.id, fileIds), eq(files.pageId, pageId)))
    : [];
  const database = page.databaseId ?? (page.kind === "database" ? page.id : null);
  return {
    page: {
      id: page.id,
      title: page.title,
      icon: page.icon,
      kind: page.kind,
      parentId: page.parentId,
      databaseId: page.databaseId,
      version: page.version,
      archivedAt: page.archivedAt,
      updatedAt: page.updatedAt,
      blocks,
      props: JSON.parse(page.props) as Record<string, Value>,
    },
    level,
    breadcrumb: breadcrumb(ws, pageId),
    subpages,
    files: Object.fromEntries(fileRows.map((f) => [f.id, f])),
    people: database ? await listUsers() : [],
  };
}

/** Saves title, icon and blocks unless someone else saved since `baseVersion`. */
export async function savePage(actor: Actor, input: z.infer<typeof savePageInput>) {
  await requireLevel(actor, input.id, "edit");
  const now = new Date();
  const updated = await db
    .update(pages)
    .set({
      title: input.title,
      icon: input.icon,
      blocks: JSON.stringify(input.blocks),
      bodyText: blocksText(input.blocks),
      version: sql`${pages.version} + 1`,
      updatedAt: now.toISOString(),
      updatedBy: actor.id,
    })
    .where(and(eq(pages.id, input.id), eq(pages.version, input.baseVersion)))
    .returning({ version: pages.version });
  if (!updated.length) return { conflict: true as const };
  await snapshot(actor.id, input.id, input, now);
  return { conflict: false as const, version: updated[0]!.version };
}

/** Keeps at most one snapshot per editor per ten minutes, for thirty days. */
async function snapshot(
  authorId: string,
  pageId: string,
  state: { title: string; icon: string | null; blocks: Block[] },
  now: Date,
) {
  const [last] = await db
    .select({ id: pageVersions.id, createdAt: pageVersions.createdAt })
    .from(pageVersions)
    .where(
      and(
        eq(pageVersions.pageId, pageId),
        eq(pageVersions.authorId, authorId),
        eq(pageVersions.pinned, false),
      ),
    )
    .orderBy(desc(pageVersions.createdAt))
    .limit(1);
  const values = {
    title: state.title,
    icon: state.icon,
    blocks: JSON.stringify(state.blocks),
    updatedAt: now.toISOString(),
  };
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * 86400000).toISOString();
  const prune = db
    .delete(pageVersions)
    .where(and(eq(pageVersions.pageId, pageId), lt(pageVersions.createdAt, cutoff)));
  if (last && withinSnapshotWindow(last.createdAt, now)) {
    await db.batch([db.update(pageVersions).set(values).where(eq(pageVersions.id, last.id)), prune]);
  } else {
    await db.batch([
      db.insert(pageVersions).values({
        id: crypto.randomUUID(),
        pageId,
        authorId,
        createdAt: now.toISOString(),
        ...values,
      }),
      prune,
    ]);
  }
}

export async function movePage(actor: Actor, input: z.infer<typeof moveInput>) {
  const { ws, node } = await requireLevel(actor, input.id, input.parentId ? "edit" : "full");
  if (node.databaseId) throw new AppError("Rows stay in their database");
  if (input.parentId) {
    const target = ws.nodes.get(input.parentId);
    if (!target || target.databaseId || target.kind === "database")
      throw new AppError("Pick a page to move into");
    if (!atLeast(ws.levels.get(input.parentId) ?? null, "edit") || target.archivedAt)
      throw notFound();
    if (descendants(ws, input.id).includes(input.parentId))
      throw new AppError("A page can't move inside itself");
  }
  await db
    .update(pages)
    .set({ parentId: input.parentId, position: Date.now() })
    .where(eq(pages.id, input.id));
  return { ok: true };
}

export async function archivePage(actor: Actor, pageId: string) {
  const { ws } = await requireLevel(actor, pageId, "edit");
  const ids = descendants(ws, pageId).filter((i) => !ws.nodes.get(i)?.archivedAt);
  await db
    .update(pages)
    .set({ archivedAt: new Date().toISOString() })
    .where(inArray(pages.id, ids));
  return { ok: true };
}

export async function restorePage(actor: Actor, pageId: string) {
  const { ws, node } = await requireLevel(actor, pageId, "edit", { archived: true });
  if (!node.archivedAt) return { ok: true };
  const ids = descendants(ws, pageId);
  const parent = node.parentId ? ws.nodes.get(node.parentId) : null;
  const ops: any[] = [
    db.update(pages).set({ archivedAt: null }).where(inArray(pages.id, ids)),
  ];
  if (parent?.archivedAt && !node.databaseId)
    ops.push(db.update(pages).set({ parentId: null }).where(eq(pages.id, pageId)));
  await db.batch(ops as [any, ...any[]]);
  return { ok: true };
}

export async function listTrash(actor: Actor) {
  const ws = await loadWorkspace(actor);
  return [...ws.nodes.values()]
    .filter((n) => {
      if (!n.archivedAt || !ws.levels.get(n.id)) return false;
      const parent = n.parentId ? ws.nodes.get(n.parentId) : null;
      return !parent?.archivedAt;
    })
    .sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!))
    .map((n) => ({
      id: n.id,
      title: n.title,
      icon: n.icon,
      archivedAt: n.archivedAt!,
      canRestore: atLeast(ws.levels.get(n.id) ?? null, "edit"),
      canDelete: atLeast(ws.levels.get(n.id) ?? null, "full"),
    }));
}

export async function deletePage(actor: Actor, pageId: string) {
  const { ws, node } = await requireLevel(actor, pageId, "full", { archived: true });
  if (!node.archivedAt) throw new AppError("Move the page to Trash first");
  const ids = descendants(ws, pageId);
  const fileRows = await db
    .select({ key: files.key })
    .from(files)
    .where(inArray(files.pageId, ids));
  await db.batch([
    db.delete(pages).where(inArray(pages.id, ids)),
    db.delete(pageVersions).where(inArray(pageVersions.pageId, ids)),
    db.delete(grants).where(inArray(grants.pageId, ids)),
    db.delete(comments).where(inArray(comments.pageId, ids)),
    db.delete(publications).where(inArray(publications.pageId, ids)),
    db.delete(files).where(inArray(files.pageId, ids)),
    db.delete(properties).where(inArray(properties.databaseId, ids)),
    db.delete(views).where(inArray(views.databaseId, ids)),
  ]);
  if (fileRows.length) await env.files.delete(fileRows.map((f) => f.key));
  return { ok: true };
}

export async function search(actor: Actor, q: string) {
  const term = q.trim();
  if (!term) return [];
  const ws = await loadWorkspace(actor);
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({ id: pages.id, bodyText: pages.bodyText })
    .from(pages)
    .where(
      sql`${pages.archivedAt} is null and (${pages.title} like ${like} escape '\\' or ${pages.bodyText} like ${like} escape '\\')`,
    )
    .limit(500);
  const lower = term.toLowerCase();
  return rows
    .filter((r) => ws.levels.get(r.id))
    .map((r) => {
      const n = ws.nodes.get(r.id)!;
      const line = r.bodyText.split("\n").find((l) => l.toLowerCase().includes(lower)) ?? "";
      return {
        id: n.id,
        title: n.title,
        icon: n.icon,
        updatedAt: n.updatedAt,
        path: breadcrumb(ws, n.id).map((b) => b.title || "Untitled"),
        excerpt: line.slice(0, 200),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);
}
