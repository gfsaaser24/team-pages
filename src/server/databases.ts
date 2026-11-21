import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pages, properties, views } from "@/db/schema";
import {
  PROPERTY_TYPES,
  convertValue,
  hasChoices,
  type Choice,
  type Property,
  type Value,
  type ViewConfig,
} from "@/lib/model";
import { AppError, notFound, requireLevel, type Actor } from "./access";

export const DEFAULT_STATUS_OPTIONS = (): Choice[] =>
  ["Not started", "In progress", "Done"].map((name) => ({
    id: crypto.randomUUID(),
    name,
  }));

const id = z.string().uuid();
const value = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(64)).max(100),
  z.null(),
]);
const choice = z.object({ id: z.string().min(1).max(64), name: z.string().trim().min(1).max(100) }).strict();
const config = z
  .object({
    groupBy: z.string().max(64).optional(),
    dateProperty: z.string().max(64).optional(),
    filters: z
      .array(
        z.object({
          propertyId: z.string().max(64),
          operator: z.enum([
            "contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty",
            "gt", "lt", "before", "after", "checked", "unchecked",
          ]),
          value: z.string().max(500).optional(),
        }).strict(),
      )
      .max(20)
      .optional(),
    sorts: z
      .array(z.object({ propertyId: z.string().max(64), direction: z.enum(["asc", "desc"]) }).strict())
      .max(10)
      .optional(),
    hidden: z.array(z.string().max(64)).max(100).optional(),
  })
  .strict();

export const addPropertyInput = z
  .object({ databaseId: id, name: z.string().trim().min(1).max(100), type: z.enum(PROPERTY_TYPES) })
  .strict();
export const updatePropertyInput = z
  .object({
    id,
    name: z.string().trim().min(1).max(100).optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
    options: z.array(choice).max(100).optional(),
  })
  .strict();
export const deletePropertyInput = z.object({ id }).strict();
export const addViewInput = z
  .object({
    databaseId: id,
    name: z.string().trim().min(1).max(100),
    layout: z.enum(["table", "board", "calendar", "list"]),
  })
  .strict();
export const updateViewInput = z
  .object({ id, name: z.string().trim().min(1).max(100).optional(), config: config.optional() })
  .strict();
export const deleteViewInput = z.object({ id }).strict();
export const createRowInput = z
  .object({ databaseId: id, title: z.string().max(500).optional(), props: z.record(z.string(), value).optional() })
  .strict();
export const updateRowInput = z
  .object({ id, title: z.string().max(500).optional(), props: z.record(z.string(), value).optional() })
  .strict();

function toProperty(row: typeof properties.$inferSelect): Property {
  return { id: row.id, name: row.name, type: row.type, options: JSON.parse(row.options) as Choice[] };
}

async function propertiesOf(databaseId: string): Promise<Property[]> {
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.databaseId, databaseId))
    .orderBy(properties.position, properties.id);
  return rows.map(toProperty);
}

async function databaseFor(actor: Actor, databaseId: string, level: "view" | "edit") {
  const access = await requireLevel(actor, databaseId, level);
  if (access.node.kind !== "database") throw notFound();
  return access;
}

export async function getDatabase(actor: Actor, databaseId: string) {
  const { ws } = await databaseFor(actor, databaseId, "view");
  const [props, viewRows, rowRows] = await Promise.all([
    propertiesOf(databaseId),
    db.select().from(views).where(eq(views.databaseId, databaseId)).orderBy(views.position, views.id),
    db
      .select({ id: pages.id, title: pages.title, icon: pages.icon, props: pages.props, position: pages.position })
      .from(pages)
      .where(and(eq(pages.databaseId, databaseId), isNull(pages.archivedAt)))
      .orderBy(pages.position, pages.id),
  ]);
  return {
    properties: props,
    views: viewRows.map((v) => ({
      id: v.id,
      name: v.name,
      layout: v.layout,
      config: JSON.parse(v.config) as ViewConfig,
    })),
    rows: rowRows
      .filter((r) => ws.levels.get(r.id))
      .map((r) => ({ id: r.id, title: r.title, icon: r.icon, props: JSON.parse(r.props) as Record<string, Value> })),
  };
}

/** Row values checked against the database's properties; unknown ones are dropped. */
function cleanValues(input: Record<string, Value>, props: Property[]) {
  const out: Record<string, Value> = {};
  for (const [key, v] of Object.entries(input)) {
    const p = props.find((x) => x.id === key);
    if (!p) continue;
    if (v === null || v === "") {
      out[key] = null;
      continue;
    }
    const ok =
      (p.type === "number" && typeof v === "number" && Number.isFinite(v)) ||
      (p.type === "checkbox" && typeof v === "boolean") ||
      ((p.type === "text" || p.type === "person") && typeof v === "string") ||
      (p.type === "url" && typeof v === "string") ||
      (p.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ||
      ((p.type === "select" || p.type === "status") && typeof v === "string" && p.options.some((o) => o.id === v)) ||
      (p.type === "multi_select" && Array.isArray(v) && v.every((x) => p.options.some((o) => o.id === x)));
    if (!ok) throw new AppError(`That value doesn't fit ${p.name}`);
    out[key] = v;
  }
  return out;
}

export async function createRow(actor: Actor, input: z.infer<typeof createRowInput>) {
  await databaseFor(actor, input.databaseId, "edit");
  const props = cleanValues(input.props ?? {}, await propertiesOf(input.databaseId));
  const rowId = crypto.randomUUID();
  await db.insert(pages).values({
    id: rowId,
    parentId: input.databaseId,
    databaseId: input.databaseId,
    ownerId: actor.id,
    title: input.title ?? "",
    props: JSON.stringify(props),
    position: Date.now(),
    updatedBy: actor.id,
  });
  return { id: rowId };
}

export async function updateRow(actor: Actor, input: z.infer<typeof updateRowInput>) {
  const { node } = await requireLevel(actor, input.id, "edit");
  if (!node.databaseId) throw notFound();
  const change = cleanValues(input.props ?? {}, await propertiesOf(node.databaseId));
  // Each value is set in place, so concurrent edits to other fields survive.
  let props = sql`${pages.props}`;
  for (const [key, v] of Object.entries(change)) {
    const path = "$." + JSON.stringify(key);
    props =
      v === null
        ? sql`json_remove(${props}, ${path})`
        : sql`json_set(${props}, ${path}, json(${JSON.stringify(v)}))`;
  }
  const [saved] = await db
    .update(pages)
    .set({
      props,
      // A new title is a content change an open editor must not overwrite.
      ...(input.title !== undefined
        ? { title: input.title, version: sql`${pages.version} + 1` }
        : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    })
    .where(eq(pages.id, input.id))
    .returning({ version: pages.version });
  return { version: saved!.version };
}

export async function addProperty(actor: Actor, input: z.infer<typeof addPropertyInput>) {
  await databaseFor(actor, input.databaseId, "edit");
  const propertyId = crypto.randomUUID();
  await db.insert(properties).values({
    id: propertyId,
    databaseId: input.databaseId,
    name: input.name,
    type: input.type,
    options: JSON.stringify(input.type === "status" ? DEFAULT_STATUS_OPTIONS() : []),
    position: Date.now(),
  });
  return { id: propertyId };
}

async function propertyFor(actor: Actor, propertyId: string) {
  const [row] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!row) throw notFound();
  await databaseFor(actor, row.databaseId, "edit");
  return row;
}

export async function updateProperty(actor: Actor, input: z.infer<typeof updatePropertyInput>) {
  const row = await propertyFor(actor, input.id);
  const before = toProperty(row);
  const type = input.type ?? before.type;
  let options = input.options ?? before.options;
  if (!hasChoices(type)) options = [];
  else if (input.type && input.type !== before.type && !input.options) {
    options = hasChoices(before.type) ? before.options : type === "status" ? DEFAULT_STATUS_OPTIONS() : [];
  }
  const after: Property = { ...before, name: input.name ?? before.name, type, options };
  const ops: any[] = [
    db
      .update(properties)
      .set({ name: after.name, type: after.type, options: JSON.stringify(after.options) })
      .where(eq(properties.id, input.id)),
  ];
  const typeChanged = after.type !== before.type;
  const optionsRemoved = before.options.some((o) => !after.options.some((n) => n.id === o.id));
  if (typeChanged || optionsRemoved) {
    const rows = await db
      .select({ id: pages.id, props: pages.props })
      .from(pages)
      .where(eq(pages.databaseId, row.databaseId));
    for (const r of rows) {
      const values = JSON.parse(r.props) as Record<string, Value>;
      if (!(input.id in values)) continue;
      let next = typeChanged ? convertValue(values[input.id], before, after) : values[input.id]!;
      if (!typeChanged && hasChoices(after.type)) {
        const keep = (x: string) => after.options.some((o) => o.id === x);
        next = Array.isArray(next) ? next.filter(keep) : typeof next === "string" && keep(next) ? next : null;
        if (Array.isArray(next) && !next.length) next = null;
      }
      if (next === null) delete values[input.id];
      else values[input.id] = next;
      ops.push(db.update(pages).set({ props: JSON.stringify(values) }).where(eq(pages.id, r.id)));
    }
  }
  await db.batch(ops as [any, ...any[]]);
  return after;
}

export async function deleteProperty(actor: Actor, propertyId: string) {
  const row = await propertyFor(actor, propertyId);
  await db.batch([
    db.delete(properties).where(eq(properties.id, propertyId)),
    db
      .update(pages)
      .set({ props: sql`json_remove(${pages.props}, ${"$." + JSON.stringify(propertyId)})` })
      .where(eq(pages.databaseId, row.databaseId)),
  ]);
  return { ok: true };
}

export async function addView(actor: Actor, input: z.infer<typeof addViewInput>) {
  await databaseFor(actor, input.databaseId, "edit");
  const props = await propertiesOf(input.databaseId);
  const cfg: ViewConfig = {};
  if (input.layout === "board") {
    const group = props.find((p) => p.type === "status") ?? props.find((p) => p.type === "select");
    if (!group) throw new AppError("Add a select or status property first");
    cfg.groupBy = group.id;
  }
  if (input.layout === "calendar") {
    const date = props.find((p) => p.type === "date");
    if (!date) throw new AppError("Add a date property first");
    cfg.dateProperty = date.id;
  }
  const viewId = crypto.randomUUID();
  await db.insert(views).values({
    id: viewId,
    databaseId: input.databaseId,
    name: input.name,
    layout: input.layout,
    config: JSON.stringify(cfg),
    position: Date.now(),
  });
  return { id: viewId };
}

async function viewFor(actor: Actor, viewId: string) {
  const [row] = await db.select().from(views).where(eq(views.id, viewId));
  if (!row) throw notFound();
  await databaseFor(actor, row.databaseId, "edit");
  return row;
}

export async function updateView(actor: Actor, input: z.infer<typeof updateViewInput>) {
  await viewFor(actor, input.id);
  await db
    .update(views)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.config ? { config: JSON.stringify(input.config) } : {}),
    })
    .where(eq(views.id, input.id));
  return { ok: true };
}

export async function deleteView(actor: Actor, viewId: string) {
  const row = await viewFor(actor, viewId);
  const count = await db.$count(views, eq(views.databaseId, row.databaseId));
  if (count <= 1) throw new AppError("A database keeps at least one view");
  await db.delete(views).where(eq(views.id, viewId));
  return { ok: true };
}
