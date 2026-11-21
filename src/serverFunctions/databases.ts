import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { actorFor } from "@/server/access";
import * as d from "@/server/databases";

export const createRow = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.createRowInput.parse(data))
  .handler(async ({ data, context }) => d.createRow(await actorFor(context.user), data));

export const updateRow = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.updateRowInput.parse(data))
  .handler(async ({ data, context }) => d.updateRow(await actorFor(context.user), data));

export const addProperty = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.addPropertyInput.parse(data))
  .handler(async ({ data, context }) => d.addProperty(await actorFor(context.user), data));

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.updatePropertyInput.parse(data))
  .handler(async ({ data, context }) => d.updateProperty(await actorFor(context.user), data));

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.deletePropertyInput.parse(data))
  .handler(async ({ data, context }) => d.deleteProperty(await actorFor(context.user), data.id));

export const addView = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.addViewInput.parse(data))
  .handler(async ({ data, context }) => d.addView(await actorFor(context.user), data));

export const updateView = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.updateViewInput.parse(data))
  .handler(async ({ data, context }) => d.updateView(await actorFor(context.user), data));

export const deleteView = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => d.deleteViewInput.parse(data))
  .handler(async ({ data, context }) => d.deleteView(await actorFor(context.user), data.id));
