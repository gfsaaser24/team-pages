import { describe, expect, it } from "vitest";
import {
  applyView,
  convertValue,
  resolveLevels,
  withinSnapshotWindow,
  type Property,
} from "./model";

const nodes = [
  { id: "root", parentId: null, ownerId: "alice" },
  { id: "child", parentId: "root", ownerId: "alice" },
  { id: "grandchild", parentId: "child", ownerId: "bob" },
  { id: "other", parentId: null, ownerId: "carol" },
];

describe("resolveLevels", () => {
  it("keeps pages private to their owner", () => {
    const bob = resolveLevels(nodes, [], "bob", false);
    expect(bob.get("root")).toBeNull();
    expect(bob.get("other")).toBeNull();
    expect(bob.get("grandchild")).toBe("full");
    expect(resolveLevels(nodes, [], "alice", false).get("grandchild")).toBe("full");
  });
  it("applies grants to sub-pages and takes the broadest", () => {
    const grants = [
      { pageId: "root", subject: "bob", level: "view" as const },
      { pageId: "child", subject: "*", level: "edit" as const },
    ];
    const bob = resolveLevels(nodes, grants, "bob", false);
    expect(bob.get("root")).toBe("view");
    expect(bob.get("child")).toBe("edit");
    const dave = resolveLevels(nodes, grants, "dave", false);
    expect(dave.get("root")).toBeNull();
    expect(dave.get("grandchild")).toBe("edit");
  });
  it("gives admins full access", () => {
    expect(resolveLevels(nodes, [], "zed", true).get("other")).toBe("full");
  });
});

const status: Property = {
  id: "s",
  name: "Status",
  type: "status",
  options: [
    { id: "a", name: "Todo" },
    { id: "b", name: "Done" },
  ],
};
const text: Property = { id: "s", name: "Status", type: "text", options: [] };
const number: Property = { id: "s", name: "Status", type: "number", options: [] };

describe("convertValue", () => {
  it("keeps compatible values and clears the rest", () => {
    expect(convertValue("b", status, text)).toBe("Done");
    expect(convertValue("Done", text, status)).toBe("b");
    expect(convertValue("Maybe", text, status)).toBeNull();
    expect(convertValue("12", text, number)).toBe(12);
    expect(convertValue("twelve", text, number)).toBeNull();
    expect(convertValue(4, number, { ...number, type: "checkbox" })).toBeNull();
  });
});

describe("applyView", () => {
  const rows = [
    { id: "1", title: "B", props: { s: "b", n: 3 } },
    { id: "2", title: "A", props: { s: "a", n: 1 } },
    { id: "3", title: "C", props: { s: null, n: 2 } },
  ];
  const props: Property[] = [status, { id: "n", name: "N", type: "number", options: [] }];
  it("filters by type-aware operators", () => {
    expect(applyView(rows, { filters: [{ propertyId: "s", operator: "is", value: "b" }] }, props).map((r) => r.id)).toEqual(["1"]);
    expect(applyView(rows, { filters: [{ propertyId: "n", operator: "gt", value: "1" }] }, props).map((r) => r.id)).toEqual(["1", "3"]);
    expect(applyView(rows, { filters: [{ propertyId: "s", operator: "is_empty" }] }, props).map((r) => r.id)).toEqual(["3"]);
  });
  it("sorts with empty values last", () => {
    expect(applyView(rows, { sorts: [{ propertyId: "n", direction: "asc" }] }, props).map((r) => r.id)).toEqual(["2", "3", "1"]);
    expect(applyView(rows, { sorts: [{ propertyId: "s", direction: "desc" }] }, props).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(applyView(rows, { sorts: [{ propertyId: "title", direction: "asc" }] }, props).map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});

describe("withinSnapshotWindow", () => {
  it("allows one snapshot per editor per ten minutes", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(withinSnapshotWindow(null, now)).toBe(false);
    expect(withinSnapshotWindow("2026-01-01T09:55:00Z", now)).toBe(true);
    expect(withinSnapshotWindow("2026-01-01T09:49:00Z", now)).toBe(false);
  });
});
