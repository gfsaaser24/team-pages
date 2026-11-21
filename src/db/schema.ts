import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** People the Gateway signed in, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull().default(now),
});

/**
 * Pages, databases and database rows. A row is a page whose `databaseId` is
 * its database (and whose parent is that database).
 */
export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    ownerId: text("owner_id").notNull(),
    kind: text("kind", { enum: ["page", "database"] })
      .notNull()
      .default("page"),
    databaseId: text("database_id"),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    /** The block list as JSON: [{ id, type, text, checked?, ref? }]. */
    blocks: text("blocks").notNull().default("[]"),
    /** Plain text of the blocks, for search. */
    bodyText: text("body_text").notNull().default(""),
    /** A database row's property values as JSON: { [propertyId]: value }. */
    props: text("props").notNull().default("{}"),
    position: integer("position").notNull().default(0),
    version: integer("version").notNull().default(1),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    updatedBy: text("updated_by"),
  },
  (t) => [
    index("pages_parent").on(t.parentId),
    index("pages_database").on(t.databaseId),
  ],
);

export const pageVersions = sqliteTable(
  "page_versions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    authorId: text("author_id").notNull(),
    title: text("title").notNull(),
    icon: text("icon"),
    blocks: text("blocks").notNull(),
    /** Saved before a restore: never updated in place. */
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("versions_page").on(t.pageId, t.createdAt)],
);

export const grants = sqliteTable(
  "grants",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    /** A user id, or "*" for everyone in the workspace. */
    subject: text("subject").notNull(),
    level: text("level", { enum: ["full", "edit", "comment", "view"] }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("grants_page_subject").on(t.pageId, t.subject)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    blockId: text("block_id"),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("comments_page").on(t.pageId)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("files_page").on(t.pageId)],
);

export const publications = sqliteTable("publications", {
  pageId: text("page_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  expiresAt: text("expires_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id").notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: [
        "text",
        "number",
        "select",
        "multi_select",
        "status",
        "date",
        "person",
        "checkbox",
        "url",
      ],
    }).notNull(),
    /** Choices for select, multi-select and status: [{ id, name }]. */
    options: text("options").notNull().default("[]"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("properties_database").on(t.databaseId)],
);

export const views = sqliteTable(
  "views",
  {
    id: text("id").primaryKey(),
    databaseId: text("database_id").notNull(),
    name: text("name").notNull(),
    layout: text("layout", {
      enum: ["table", "board", "calendar", "list"],
    }).notNull(),
    /** { groupBy?, dateProperty?, filters, sorts, hidden } as JSON. */
    config: text("config").notNull().default("{}"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("views_database").on(t.databaseId)],
);
