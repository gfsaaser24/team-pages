import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { grants, users } from "@/db/schema";
import { LEVELS } from "@/lib/model";
import { AppError, listUsers, requireLevel, type Actor } from "./access";

const id = z.string().uuid();
export const setGrantInput = z
  .object({ pageId: id, subject: z.string().min(1).max(128), level: z.enum(LEVELS) })
  .strict();
export const removeGrantInput = z.object({ pageId: id, subject: z.string().min(1).max(128) }).strict();

export async function getSharing(actor: Actor, pageId: string) {
  const { ws } = await requireLevel(actor, pageId, "full");
  const chain: string[] = [];
  for (let cur = ws.nodes.get(pageId); cur; cur = cur.parentId ? ws.nodes.get(cur.parentId) : undefined)
    chain.push(cur.id);
  const all = await db
    .select({ pageId: grants.pageId, subject: grants.subject, level: grants.level, email: users.email })
    .from(grants)
    .leftJoin(users, eq(users.id, grants.subject));
  const owner = ws.nodes.get(pageId)!.ownerId;
  const [ownerRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner));
  return {
    owner: ownerRow?.email ?? null,
    grants: all
      .filter((g) => g.pageId === pageId)
      .map((g) => ({ subject: g.subject, level: g.level, email: g.subject === "*" ? null : g.email })),
    inherited: all
      .filter((g) => g.pageId !== pageId && chain.includes(g.pageId))
      .map((g) => ({
        subject: g.subject,
        level: g.level,
        email: g.subject === "*" ? null : g.email,
        from: ws.nodes.get(g.pageId)?.title ?? "",
      })),
    people: await listUsers(),
  };
}

export async function setGrant(actor: Actor, input: z.infer<typeof setGrantInput>) {
  await requireLevel(actor, input.pageId, "full");
  if (input.subject !== "*") {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.subject));
    if (!u) throw new AppError("That person hasn't opened the app yet");
  }
  await db
    .insert(grants)
    .values({ id: crypto.randomUUID(), pageId: input.pageId, subject: input.subject, level: input.level, createdBy: actor.id })
    .onConflictDoUpdate({ target: [grants.pageId, grants.subject], set: { level: input.level } });
  return { ok: true };
}

export async function removeGrant(actor: Actor, input: z.infer<typeof removeGrantInput>) {
  await requireLevel(actor, input.pageId, "full");
  await db.delete(grants).where(and(eq(grants.pageId, input.pageId), eq(grants.subject, input.subject)));
  return { ok: true };
}

