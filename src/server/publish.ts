import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, pages, properties, publications } from "@/db/schema";
import { displayText, type Block, type Choice, type Property, type Value } from "@/lib/model";
import { descendants, loadWorkspace, requireLevel, type Actor } from "./access";

const id = z.string().uuid();
export const pageInput = z.object({ pageId: id }).strict();
export const expiryInput = z
  .object({ pageId: id, expiresAt: z.string().datetime().nullable() })
  .strict();

function newSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function getPublication(actor: Actor, pageId: string) {
  await requireLevel(actor, pageId, "full");
  const [row] = await db
    .select({ slug: publications.slug, expiresAt: publications.expiresAt })
    .from(publications)
    .where(eq(publications.pageId, pageId));
  return row ?? null;
}

export async function publish(actor: Actor, pageId: string) {
  await requireLevel(actor, pageId, "full");
  await db
    .insert(publications)
    .values({ pageId, slug: newSlug(), createdBy: actor.id })
    .onConflictDoNothing();
  return getPublication(actor, pageId);
}

export async function setExpiry(actor: Actor, input: z.infer<typeof expiryInput>) {
  await requireLevel(actor, input.pageId, "full");
  await db
    .update(publications)
    .set({ expiresAt: input.expiresAt })
    .where(eq(publications.pageId, input.pageId));
  return getPublication(actor, input.pageId);
}

export async function unpublish(actor: Actor, pageId: string) {
  await requireLevel(actor, pageId, "full");
  await db.delete(publications).where(eq(publications.pageId, pageId));
  return { ok: true };
}

const nobody: Actor = { id: "", email: "", admin: false };

/** The published page's live subtree, or null when the link doesn't work. */
async function publishedTree(slug: string) {
  const [pub] = await db.select().from(publications).where(eq(publications.slug, slug));
  if (!pub) return null;
  if (pub.expiresAt && new Date(pub.expiresAt).getTime() <= Date.now()) return null;
  const ws = await loadWorkspace(nobody);
  const root = ws.nodes.get(pub.pageId);
  if (!root || root.archivedAt) return null;
  const ids = descendants(ws, pub.pageId).filter((i) => !ws.nodes.get(i)?.archivedAt);
  return { rootId: pub.pageId, ids: new Set(ids), ws };
}

export async function getPublicPage(slug: string, pageId: string | undefined) {
  const tree = await publishedTree(slug);
  if (!tree) return null;
  const target = pageId ?? tree.rootId;
  if (!tree.ids.has(target)) return null;
  const [page] = await db.select().from(pages).where(eq(pages.id, target));
  if (!page) return null;
  const blocks = JSON.parse(page.blocks) as Block[];
  const subpages = Object.fromEntries(
    blocks
      .filter((b) => b.type === "subpage" && b.ref && tree.ids.has(b.ref))
      .map((b) => {
        const n = tree.ws.nodes.get(b.ref!)!;
        return [n.id, { title: n.title, icon: n.icon }];
      }),
  );
  const fileIds = blocks.filter((b) => b.type === "file" && b.ref).map((b) => b.ref!);
  const fileRows = fileIds.length
    ? await db
        .select({ id: files.id, name: files.name, contentType: files.contentType, size: files.size })
        .from(files)
        .where(and(inArray(files.id, fileIds), eq(files.pageId, target)))
    : [];
  const trail: { id: string; title: string; icon: string | null }[] = [];
  for (let cur = tree.ws.nodes.get(target); cur && cur.id !== tree.rootId && cur.parentId; ) {
    cur = tree.ws.nodes.get(cur.parentId);
    if (cur) trail.unshift({ id: cur.id, title: cur.title, icon: cur.icon });
  }
  let database: { columns: string[]; rows: { id: string; title: string; cells: string[] }[] } | null = null;
  if (page.kind === "database") {
    const props: Property[] = (
      await db.select().from(properties).where(eq(properties.databaseId, target)).orderBy(properties.position)
    )
      .filter((p) => p.type !== "person")
      .map((p) => ({ id: p.id, name: p.name, type: p.type, options: JSON.parse(p.options) as Choice[] }));
    const rows = await db
      .select({ id: pages.id, title: pages.title, props: pages.props })
      .from(pages)
      .where(and(eq(pages.databaseId, target), isNull(pages.archivedAt)))
      .orderBy(pages.position);
    database = {
      columns: props.map((p) => p.name),
      rows: rows.map((r) => {
        const values = JSON.parse(r.props) as Record<string, Value>;
        return { id: r.id, title: r.title, cells: props.map((p) => displayText(values[p.id], p)) };
      }),
    };
  }
  return {
    page: { id: page.id, title: page.title, icon: page.icon, blocks },
    trail,
    subpages,
    files: Object.fromEntries(fileRows.map((f) => [f.id, f])),
    database,
  };
}

/** A file on a page inside the published subtree. */
export async function publicFile(slug: string, fileId: string) {
  const tree = await publishedTree(slug);
  if (!tree) return null;
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file || !tree.ids.has(file.pageId)) return null;
  return file;
}
