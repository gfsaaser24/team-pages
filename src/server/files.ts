import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { files, uploads } from "@/db/schema";
import { MAX_FILE_BYTES, MAX_FILE_LABEL, UPLOAD_PART_BYTES } from "@/lib/model";
import { AppError, notFound, requireLevel, type Actor } from "./access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Uploads a file of at most one part in a single request. Larger files use startUpload. */
export async function uploadFile(actor: Actor, pageId: string, file: File) {
  if (!UUID.test(pageId)) throw notFound();
  await requireLevel(actor, pageId, "edit");
  if (file.size > UPLOAD_PART_BYTES) throw new AppError("Upload files over 10 MB in parts", 413);
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

interface UploadStart {
  pageId: string;
  name: string;
  contentType: string;
  size: number;
}

/** Starts a multipart upload to R2; the browser then sends the parts with uploadPart. */
export async function startUpload(actor: Actor, start: UploadStart) {
  if (!UUID.test(start.pageId)) throw notFound();
  await requireLevel(actor, start.pageId, "edit");
  if (!Number.isSafeInteger(start.size) || start.size < 1) throw new AppError("Send the file's size", 400);
  if (start.size > MAX_FILE_BYTES) throw new AppError(`Files can be up to ${MAX_FILE_LABEL}`, 413);
  const id = crypto.randomUUID();
  const key = `pages/${start.pageId}/${id}`;
  const contentType = start.contentType || "application/octet-stream";
  const upload = await env.files.createMultipartUpload(key, { httpMetadata: { contentType } });
  await db.insert(uploads).values({
    id,
    pageId: start.pageId,
    key,
    uploadId: upload.uploadId,
    name: start.name.slice(0, 200) || "file",
    contentType,
    size: start.size,
    uploadedBy: actor.id,
  });
  return { id, partSize: UPLOAD_PART_BYTES, parts: partCount(start.size) };
}

/** Stores one part. Every part is exactly UPLOAD_PART_BYTES except the last, which holds the rest. */
export async function uploadPart(actor: Actor, uploadId: string, partNumber: number, bytes: ArrayBuffer) {
  const pending = await pendingUpload(actor, uploadId);
  const count = partCount(pending.size);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count)
    throw new AppError(`Parts are numbered 1 to ${count}`, 400);
  const expected = partNumber < count ? UPLOAD_PART_BYTES : pending.size - UPLOAD_PART_BYTES * (count - 1);
  if (bytes.byteLength !== expected) throw new AppError(`Part ${partNumber} must be ${expected} bytes`, 400);
  const part = await env.files.resumeMultipartUpload(pending.key, pending.uploadId).uploadPart(partNumber, bytes);
  return { partNumber: part.partNumber, etag: part.etag };
}

/** Joins the parts into the file and records it on the page. */
export async function completeUpload(
  actor: Actor,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  const pending = await pendingUpload(actor, uploadId);
  if (parts.length !== partCount(pending.size)) throw new AppError("Send every part before completing", 400);
  const multipart = env.files.resumeMultipartUpload(pending.key, pending.uploadId);
  const object = await multipart.complete(parts);
  if (object.size !== pending.size) {
    await env.files.delete(pending.key);
    throw new AppError("The upload didn't arrive whole. Try again.", 400);
  }
  await db.batch([
    db.insert(files).values({
      id: pending.id,
      pageId: pending.pageId,
      key: pending.key,
      name: pending.name,
      contentType: pending.contentType,
      size: pending.size,
      uploadedBy: actor.id,
    }),
    db.delete(uploads).where(eq(uploads.id, pending.id)),
  ]);
  return { id: pending.id, name: pending.name, contentType: pending.contentType, size: pending.size };
}

/** Cancels an upload: R2 drops the parts sent so far. */
export async function abortUpload(actor: Actor, uploadId: string) {
  const pending = await pendingUpload(actor, uploadId);
  await env.files.resumeMultipartUpload(pending.key, pending.uploadId).abort();
  await db.delete(uploads).where(eq(uploads.id, pending.id));
}

const partCount = (size: number) => Math.ceil(size / UPLOAD_PART_BYTES);

/** The caller's own upload in progress, on a page they can still edit. */
async function pendingUpload(actor: Actor, uploadId: string) {
  if (!UUID.test(uploadId)) throw notFound();
  const [pending] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.uploadedBy, actor.id)));
  if (!pending) throw notFound();
  await requireLevel(actor, pending.pageId, "edit");
  return pending;
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
