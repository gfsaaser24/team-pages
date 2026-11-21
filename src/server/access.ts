import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { grants, pages, users } from "@/db/schema";
import { atLeast, resolveLevels, type Level } from "@/lib/model";

export interface Actor {
  id: string;
  email: string;
  admin: boolean;
}

/** A refusal the page shows as is. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const notFound = () => new AppError("Page not found", 404);

/** The caller as the app knows them: created on first sight, email kept current. */
export async function actorFor(user: EveryAppUser): Promise<Actor> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}

export interface PageNode {
  id: string;
  parentId: string | null;
  ownerId: string;
  kind: "page" | "database";
  databaseId: string | null;
  title: string;
  icon: string | null;
  archivedAt: string | null;
  updatedAt: string;
  position: number;
}

export interface Workspace {
  nodes: Map<string, PageNode>;
  levels: Map<string, Level | null>;
  /** Pages with a grant on themselves or an ancestor. */
  shared: Set<string>;
}

/** Every page with the caller's level on it. */
export async function loadWorkspace(actor: Actor): Promise<Workspace> {
  const [nodeRows, grantRows] = await Promise.all([
    db
      .select({
        id: pages.id,
        parentId: pages.parentId,
        ownerId: pages.ownerId,
        kind: pages.kind,
        databaseId: pages.databaseId,
        title: pages.title,
        icon: pages.icon,
        archivedAt: pages.archivedAt,
        updatedAt: pages.updatedAt,
        position: pages.position,
      })
      .from(pages),
    db
      .select({ pageId: grants.pageId, subject: grants.subject, level: grants.level })
      .from(grants),
  ]);
  const nodes = new Map(nodeRows.map((n) => [n.id, n]));
  const levels = resolveLevels(nodeRows, grantRows, actor.id, actor.admin);
  const granted = new Set(grantRows.map((g) => g.pageId));
  const shared = new Set<string>();
  for (const n of nodeRows) {
    for (
      let cur: PageNode | undefined = n;
      cur;
      cur = cur.parentId ? nodes.get(cur.parentId) : undefined
    ) {
      if (granted.has(cur.id)) {
        shared.add(n.id);
        break;
      }
    }
  }
  return { nodes, levels, shared };
}

/** The page and the caller's level, or a refusal below `needed`. */
export async function requireLevel(
  actor: Actor,
  pageId: string,
  needed: Level,
  options: { archived?: boolean } = {},
): Promise<{ ws: Workspace; node: PageNode; level: Level }> {
  const ws = await loadWorkspace(actor);
  const node = ws.nodes.get(pageId);
  const level = ws.levels.get(pageId) ?? null;
  if (!node || !level || (node.archivedAt && !options.archived)) throw notFound();
  if (!atLeast(level, needed))
    throw new AppError("You don't have permission to do that", 403);
  return { ws, node, level };
}

export function descendants(ws: Workspace, rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const n of ws.nodes.values()) {
    if (!n.parentId) continue;
    children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Accessible ancestors, top first. */
export function breadcrumb(ws: Workspace, pageId: string) {
  const out: { id: string; title: string; icon: string | null }[] = [];
  let cur = ws.nodes.get(pageId);
  while (cur?.parentId) {
    cur = ws.nodes.get(cur.parentId);
    if (!cur || !ws.levels.get(cur.id)) break;
    out.unshift({ id: cur.id, title: cur.title, icon: cur.icon });
  }
  return out;
}

export function listUsers(): Promise<{ id: string; email: string }[]> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .orderBy(users.email);
}
