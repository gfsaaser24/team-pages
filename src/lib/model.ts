// Types and rules shared by the pages and the server.

export const BLOCK_TYPES = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
  "code",
  "divider",
  "subpage",
  "file",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  /** The sub-page id for "subpage", the file id for "file". */
  ref?: string;
}

/** Block types a person can turn a text block into. */
export const TEXT_TYPES: { type: BlockType; label: string }[] = [
  { type: "paragraph", label: "Text" },
  { type: "heading_1", label: "Heading 1" },
  { type: "heading_2", label: "Heading 2" },
  { type: "heading_3", label: "Heading 3" },
  { type: "bulleted", label: "Bulleted list" },
  { type: "numbered", label: "Numbered list" },
  { type: "todo", label: "To-do" },
  { type: "quote", label: "Quote" },
  { type: "code", label: "Code" },
];

/** The largest attachment, uploaded to R2 in parts of UPLOAD_PART_BYTES. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_FILE_LABEL = "5 GB";
/**
 * One upload request's worth of a file. Workers refuse request bodies over
 * 100 MB, and R2 needs every multipart part but the last to be at least 5 MiB.
 * A file this size or smaller goes up in a single request.
 */
export const UPLOAD_PART_BYTES = 10 * 1024 * 1024;

export const LEVELS = ["view", "comment", "edit", "full"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  full: "Full access",
  edit: "Can edit",
  comment: "Can comment",
  view: "Can view",
};

export function atLeast(level: Level | null, needed: Level): boolean {
  return level !== null && LEVELS.indexOf(level) >= LEVELS.indexOf(needed);
}

export function broadest(a: Level | null, b: Level | null): Level | null {
  if (a === null) return b;
  if (b === null) return a;
  return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

export interface AccessNode {
  id: string;
  parentId: string | null;
  ownerId: string;
}
export interface AccessGrant {
  pageId: string;
  subject: string;
  level: Level;
}

/**
 * The caller's effective level on each page: the broadest of admin, being
 * the owner of the page or an ancestor, and every grant on the page or an
 * ancestor to the caller or to everyone.
 */
export function resolveLevels(
  nodes: AccessNode[],
  grantList: AccessGrant[],
  userId: string,
  admin: boolean,
): Map<string, Level | null> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const own = new Map<string, Level | null>();
  for (const n of nodes) own.set(n.id, n.ownerId === userId ? "full" : null);
  for (const g of grantList) {
    if (g.subject !== userId && g.subject !== "*") continue;
    if (!own.has(g.pageId)) continue;
    own.set(g.pageId, broadest(own.get(g.pageId) ?? null, g.level));
  }
  const result = new Map<string, Level | null>();
  const resolve = (id: string, seen: Set<string>): Level | null => {
    if (result.has(id)) return result.get(id)!;
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    seen.add(id);
    let level = admin ? "full" : (own.get(id) ?? null);
    if (node.parentId) level = broadest(level, resolve(node.parentId, seen));
    result.set(id, level);
    return level;
  };
  for (const n of nodes) resolve(n.id, new Set());
  return result;
}

// Databases

export const PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "checkbox",
  "url",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_LABELS: Record<PropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  status: "Status",
  date: "Date",
  person: "Person",
  checkbox: "Checkbox",
  url: "URL",
};

export interface Choice {
  id: string;
  name: string;
}
export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options: Choice[];
}
export type Value = string | number | boolean | string[] | null;

export function hasChoices(type: PropertyType): boolean {
  return type === "select" || type === "multi_select" || type === "status";
}

/** A value carried over to a new type, or null when it doesn't fit. */
export function convertValue(
  value: Value | undefined,
  from: Property,
  to: Property,
): Value {
  if (value === null || value === undefined) return null;
  if (from.type === to.type) return value;
  const text = displayText(value, from);
  switch (to.type) {
    case "text":
      return text === "" ? null : text;
    case "number": {
      const n = typeof value === "number" ? value : Number(text);
      return text !== "" && Number.isFinite(n) ? n : null;
    }
    case "url":
      return /^https?:\/\/\S+$/.test(text) ? text : null;
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    case "checkbox":
      return typeof value === "boolean" ? value : null;
    case "select":
    case "status": {
      const names = Array.isArray(value)
        ? value.map((id) => choiceName(from, id))
        : [text];
      const match = to.options.find((o) => o.name === names[0]);
      return match ? match.id : null;
    }
    case "multi_select": {
      const names = Array.isArray(value)
        ? value.map((id) => choiceName(from, id))
        : hasChoices(from.type)
          ? [choiceName(from, String(value))]
          : [text];
      const ids = names
        .map((n) => to.options.find((o) => o.name === n)?.id)
        .filter((id): id is string => !!id);
      return ids.length ? ids : null;
    }
    case "person":
      return null;
  }
}

function choiceName(p: Property, id: string): string {
  return p.options.find((o) => o.id === id)?.name ?? "";
}

/** How a value reads as text (people show as their id here). */
export function displayText(value: Value | undefined, p: Property): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((id) => choiceName(p, id)).join(", ");
  if (p.type === "select" || p.type === "status") return choiceName(p, String(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// Views

export type Operator =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "lt"
  | "before"
  | "after"
  | "checked"
  | "unchecked";

export interface Filter {
  propertyId: string;
  operator: Operator;
  value?: string;
}
export interface Sort {
  propertyId: string;
  direction: "asc" | "desc";
}
export interface ViewConfig {
  groupBy?: string;
  dateProperty?: string;
  filters?: Filter[];
  sorts?: Sort[];
  hidden?: string[];
}

/** The title is a pseudo-property with this id in filters and sorts. */
export const TITLE_ID = "title";

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "contains",
  not_contains: "does not contain",
  is: "is",
  is_not: "is not",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  gt: "greater than",
  lt: "less than",
  before: "before",
  after: "after",
  checked: "is checked",
  unchecked: "is not checked",
};

export function operatorsFor(type: PropertyType | "title"): Operator[] {
  switch (type) {
    case "title":
    case "text":
    case "url":
      return ["contains", "not_contains", "is", "is_empty", "is_not_empty"];
    case "number":
      return ["is", "gt", "lt", "is_empty", "is_not_empty"];
    case "select":
    case "status":
    case "person":
      return ["is", "is_not", "is_empty", "is_not_empty"];
    case "multi_select":
      return ["contains", "not_contains", "is_empty", "is_not_empty"];
    case "date":
      return ["is", "before", "after", "is_empty", "is_not_empty"];
    case "checkbox":
      return ["checked", "unchecked"];
  }
}

export function needsValue(op: Operator): boolean {
  return !["is_empty", "is_not_empty", "checked", "unchecked"].includes(op);
}

export interface RowLike {
  id: string;
  title: string;
  props: Record<string, Value>;
}

function isEmpty(v: Value | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function matches(row: RowLike, f: Filter, props: Property[]): boolean {
  const p = props.find((x) => x.id === f.propertyId);
  const type = f.propertyId === TITLE_ID ? "title" : p?.type;
  if (!type) return true;
  const v: Value | undefined = f.propertyId === TITLE_ID ? row.title : row.props[f.propertyId];
  const want = f.value ?? "";
  if (needsValue(f.operator) && want === "") return true;
  switch (f.operator) {
    case "is_empty":
      return isEmpty(v);
    case "is_not_empty":
      return !isEmpty(v);
    case "checked":
      return v === true;
    case "unchecked":
      return v !== true;
    case "contains":
      return Array.isArray(v)
        ? v.includes(want)
        : String(v ?? "").toLowerCase().includes(want.toLowerCase());
    case "not_contains":
      return Array.isArray(v)
        ? !v.includes(want)
        : !String(v ?? "").toLowerCase().includes(want.toLowerCase());
    case "is":
      return type === "number" ? Number(v) === Number(want) && !isEmpty(v) : String(v ?? "") === want;
    case "is_not":
      return String(v ?? "") !== want;
    case "gt":
      return !isEmpty(v) && Number(v) > Number(want);
    case "lt":
      return !isEmpty(v) && Number(v) < Number(want);
    case "before":
      return !isEmpty(v) && String(v) < want;
    case "after":
      return !isEmpty(v) && String(v) > want;
  }
}

function sortKey(row: RowLike, s: Sort, props: Property[]): string | number | null {
  if (s.propertyId === TITLE_ID) return row.title.toLowerCase();
  const p = props.find((x) => x.id === s.propertyId);
  const v = row.props[s.propertyId];
  if (!p || isEmpty(v)) return null;
  if (p.type === "number") return Number(v);
  if (p.type === "checkbox") return v ? 1 : 0;
  if (p.type === "select" || p.type === "status") {
    const i = p.options.findIndex((o) => o.id === v);
    return i < 0 ? null : i;
  }
  return displayText(v, p).toLowerCase();
}

/** The rows a view shows, filtered and in its order. Empty values sort last. */
export function applyView<R extends RowLike>(
  rows: R[],
  config: ViewConfig,
  props: Property[],
): R[] {
  const filtered = rows.filter((r) =>
    (config.filters ?? []).every((f) => matches(r, f, props)),
  );
  const sorts = config.sorts ?? [];
  if (!sorts.length) return filtered;
  return [...filtered].sort((a, b) => {
    for (const s of sorts) {
      const x = sortKey(a, s, props);
      const y = sortKey(b, s, props);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      const c = x < y ? -1 : 1;
      return s.direction === "asc" ? c : -c;
    }
    return 0;
  });
}

// History

export const SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;
export const HISTORY_DAYS = 30;

/** Whether an editor's last snapshot is recent enough to be updated in place. */
export function withinSnapshotWindow(lastSnapshotAt: string | null, now: Date): boolean {
  if (!lastSnapshotAt) return false;
  return now.getTime() - new Date(lastSnapshotAt).getTime() < SNAPSHOT_WINDOW_MS;
}

export function blocksText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type !== "divider")
    .map((b) => b.text)
    .join("\n");
}
