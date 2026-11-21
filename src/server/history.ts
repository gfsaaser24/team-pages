import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pageVersions, pages, users } from "@/db/schema";
import { HISTORY_DAYS, blocksText, type Block } from "@/lib/model";
import { notFound, requireLevel, type Actor } from "./access";

const id = z.string().uuid();
export const restoreInput = z.object({ pageId: id, versionId: id }).strict();

const cutoff = () => new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();

export async function listVersions(actor: Actor, pageId: string) {
  await requireLevel(actor, pageId, "edit");
  const rows = await db
    .select({
      id: pageVersions.id,
      title: pageVersions.title,
      icon: pageVersions.icon,
      blocks: pageVersions.blocks,
      author: users.email,
      savedAt: pageVersions.updatedAt,
    })
    .from(pageVersions)
    .leftJoin(users, eq(users.id, pageVersions.authorId))
    .where(and(eq(pageVersions.pageId, pageId), gte(pageVersions.updatedAt, cutoff())))
    .orderBy(desc(pageVersions.updatedAt));
  return rows.map((r) => ({ ...r, author: r.author ?? "Former member", blocks: JSON.parse(r.blocks) as Block[] }));
}

/** Saves the current state as a version, then puts the chosen one back. */
export async function restoreVersion(actor: Actor, input: z.infer<typeof restoreInput>) {
  await requireLevel(actor, input.pageId, "edit");
  const [version] = await db
    .select()
    .from(pageVersions)
    .where(and(eq(pageVersions.id, input.versionId), eq(pageVersions.pageId, input.pageId)));
  if (!version) throw notFound();
  const [current] = await db.select().from(pages).where(eq(pages.id, input.pageId));
  const now = new Date().toISOString();
  const blocks = JSON.parse(version.blocks) as Block[];
  await db.batch([
    db.insert(pageVersions).values({
      id: crypto.randomUUID(),
      pageId: input.pageId,
      authorId: actor.id,
      title: current!.title,
      icon: current!.icon,
      blocks: current!.blocks,
      pinned: true,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .update(pages)
      .set({
        title: version.title,
        icon: version.icon,
        blocks: version.blocks,
        bodyText: blocksText(blocks),
        version: sql`${pages.version} + 1`,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .where(eq(pages.id, input.pageId)),
  ]);
  return { ok: true };
}
