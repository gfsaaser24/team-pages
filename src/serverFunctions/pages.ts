import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { actorFor } from "@/server/access";
import * as pages from "@/server/pages";
import * as databases from "@/server/databases";

// Reads a router reload must refetch are POSTs, so no cache sits in between.
export const getTree = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => pages.getTree(await actorFor(context.user)));

export const getPage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.pageIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context.user);
    const page = await pages.getPage(actor, data.id);
    const database =
      page.page.kind === "database" ? await databases.getDatabase(actor, data.id) : null;
    const rowOf = page.page.databaseId
      ? await databases.getDatabase(actor, page.page.databaseId).catch(() => null)
      : null;
    return {
      ...page,
      database,
      rowProperties: rowOf?.properties ?? null,
      me: actor.id,
    };
  });

export const createPage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.createPageInput.parse(data))
  .handler(async ({ data, context }) => pages.createPage(await actorFor(context.user), data));

export const savePage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.savePageInput.parse(data))
  .handler(async ({ data, context }) => pages.savePage(await actorFor(context.user), data));

export const movePage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.moveInput.parse(data))
  .handler(async ({ data, context }) => pages.movePage(await actorFor(context.user), data));

export const archivePage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.pageIdInput.parse(data))
  .handler(async ({ data, context }) => pages.archivePage(await actorFor(context.user), data.id));

export const restorePage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.pageIdInput.parse(data))
  .handler(async ({ data, context }) => pages.restorePage(await actorFor(context.user), data.id));

export const deletePage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.pageIdInput.parse(data))
  .handler(async ({ data, context }) => pages.deletePage(await actorFor(context.user), data.id));

export const getTrash = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => pages.listTrash(await actorFor(context.user)));

export const searchPages = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => pages.searchInput.parse(data))
  .handler(async ({ data, context }) => pages.search(await actorFor(context.user), data.q));
