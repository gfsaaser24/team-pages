import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { actorFor } from "@/server/access";
import * as sharing from "@/server/sharing";
import * as comments from "@/server/comments";
import * as history from "@/server/history";
import * as publish from "@/server/publish";

const pageInput = z.object({ pageId: z.string().uuid() }).strict();

export const getSharing = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => sharing.getSharing(await actorFor(context.user), data.pageId));

export const setGrant = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => sharing.setGrantInput.parse(data))
  .handler(async ({ data, context }) => sharing.setGrant(await actorFor(context.user), data));

export const removeGrant = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => sharing.removeGrantInput.parse(data))
  .handler(async ({ data, context }) => sharing.removeGrant(await actorFor(context.user), data));

export const getComments = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => comments.listComments(await actorFor(context.user), data.pageId));

export const addComment = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => comments.addCommentInput.parse(data))
  .handler(async ({ data, context }) => comments.addComment(await actorFor(context.user), data));

export const resolveComment = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => comments.resolveCommentInput.parse(data))
  .handler(async ({ data, context }) => comments.resolveComment(await actorFor(context.user), data));

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => comments.deleteCommentInput.parse(data))
  .handler(async ({ data, context }) => comments.deleteComment(await actorFor(context.user), data.id));

export const getVersions = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => history.listVersions(await actorFor(context.user), data.pageId));

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => history.restoreInput.parse(data))
  .handler(async ({ data, context }) => history.restoreVersion(await actorFor(context.user), data));

export const getPublication = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => publish.getPublication(await actorFor(context.user), data.pageId));

export const publishPage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => publish.publish(await actorFor(context.user), data.pageId));

export const setPublicationExpiry = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => publish.expiryInput.parse(data))
  .handler(async ({ data, context }) => publish.setExpiry(await actorFor(context.user), data));

export const unpublishPage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pageInput.parse(data))
  .handler(async ({ data, context }) => publish.unpublish(await actorFor(context.user), data.pageId));
