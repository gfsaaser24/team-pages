import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { atLeast } from "@/lib/model";
import { AppError, notFound, requireLevel, type Actor } from "./access";

const id = z.string().uuid();
export const addCommentInput = z
  .object({ pageId: id, blockId: z.string().max(64).nullable(), body: z.string().trim().min(1, "Write a comment").max(5000) })
  .strict();
export const resolveCommentInput = z.object({ id, resolved: z.boolean() }).strict();
export const deleteCommentInput = z.object({ id }).strict();

export async function listComments(actor: Actor, pageId: string) {
  const { level } = await requireLevel(actor, pageId, "view");
  const rows = await db
    .select({
      id: comments.id,
      blockId: comments.blockId,
      body: comments.body,
      authorId: comments.authorId,
      author: users.email,
      resolvedAt: comments.resolvedAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.pageId, pageId))
    .orderBy(comments.createdAt);
  return rows.map(({ authorId, ...c }) => ({
    ...c,
    author: c.author ?? "Former member",
    canResolve: atLeast(level, "edit") || authorId === actor.id,
    canDelete: atLeast(level, "full") || authorId === actor.id,
  }));
}

export async function addComment(actor: Actor, input: z.infer<typeof addCommentInput>) {
  await requireLevel(actor, input.pageId, "comment");
  await db.insert(comments).values({
    id: crypto.randomUUID(),
    pageId: input.pageId,
    blockId: input.blockId,
    authorId: actor.id,
    body: input.body,
  });
  return { ok: true };
}

async function commentFor(actor: Actor, commentId: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!c) throw notFound();
  const { level } = await requireLevel(actor, c.pageId, "view");
  return { c, level };
}

export async function resolveComment(actor: Actor, input: z.infer<typeof resolveCommentInput>) {
  const { c, level } = await commentFor(actor, input.id);
  if (!atLeast(level, "edit") && c.authorId !== actor.id)
    throw new AppError("You don't have permission to do that", 403);
  await db
    .update(comments)
    .set({ resolvedAt: input.resolved ? new Date().toISOString() : null })
    .where(eq(comments.id, input.id));
  return { ok: true };
}

export async function deleteComment(actor: Actor, commentId: string) {
  const { c, level } = await commentFor(actor, commentId);
  if (!atLeast(level, "full") && c.authorId !== actor.id)
    throw new AppError("You don't have permission to do that", 403);
  await db.delete(comments).where(and(eq(comments.id, commentId), eq(comments.pageId, c.pageId)));
  return { ok: true };
}
