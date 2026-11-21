import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { files } from "@/db/schema";
import { MAX_FILE_BYTES } from "@/lib/model";
import { AppError, notFound, requireLevel, type Actor } from "./access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function uploadFile(actor: Actor, pageId: string, file: File) {
  if (!UUID.test(pageId)) throw notFound();
  await requireLevel(actor, pageId, "edit");
  if (file.size > MAX_FILE_BYTES) throw new AppError("Files can be up to 5 MB", 413);
  const fileId = crypto.randomUUID();
  const key = `pages/${pageId}/${fileId}`;
  const contentType = file.type || "application/octet-stream";
  await env.files.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
  const name = file.name.slice(0, 200) || "file";
  await db.insert(files).values({
    id: fileId,
    pageId,
    key,
    name,
    contentType,
    size: file.size,
    uploadedBy: actor.id,
  });
  return { id: fileId, name, contentType, size: file.size };
}

export async function fileFor(actor: Actor, fileId: string) {
  if (!UUID.test(fileId)) throw notFound();
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) throw notFound();
  await requireLevel(actor, file.pageId, "view");
  return file;
}

/** The stored bytes as a response, inline only for images. */
export async function serveFile(file: typeof files.$inferSelect): Promise<Response> {
  const object = await env.files.get(file.key);
  if (!object) return new Response("Not found", { status: 404 });
  const image = /^image\/(png|jpeg|gif|webp)$/.test(file.contentType);
  return new Response(object.body, {
    headers: {
      "content-type": image ? file.contentType : file.contentType.startsWith("text/") ? "text/plain; charset=utf-8" : "application/octet-stream",
      "content-disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    },
  });
}
