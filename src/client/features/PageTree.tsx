import { Link, useParams } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Table2 } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

export interface TreeItem {
  id: string;
  title: string;
  icon: string | null;
  kind: "page" | "database";
  parentId: string | null;
  shared: boolean;
  updatedAt: string;
}

export function PageTree({ items }: { items: TreeItem[] }) {
  const roots = items.filter((i) => !i.parentId);
  const priv = roots.filter((i) => !i.shared);
  const shared = roots.filter((i) => i.shared);
  return (
    <nav data-testid="sidebar" className="space-y-5 p-3 text-sm">
      <Section title="Private" testId="sidebar-private" roots={priv} items={items} />
      <Section title="Shared" testId="sidebar-shared" roots={shared} items={items} />
    </nav>
  );
}

function Section({
  title,
  testId,
  roots,
  items,
}: {
  title: string;
  testId: string;
  roots: TreeItem[];
  items: TreeItem[];
}) {
  return (
    <div data-testid={testId} className="space-y-1">
      <div className="px-2 text-xs font-medium text-muted-foreground">{title}</div>
      {roots.length ? (
        <ul>
          {roots.map((r) => (
            <Node key={r.id} item={r} items={items} depth={0} />
          ))}
        </ul>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">No pages</p>
      )}
    </div>
  );
}

function Node({ item, items, depth }: { item: TreeItem; items: TreeItem[]; depth: number }) {
  const [open, setOpen] = useState(true);
  const params = useParams({ strict: false }) as { pageId?: string };
  const children = items.filter((i) => i.parentId === item.id);
  const active = params.pageId === item.id;
  const Icon = item.kind === "database" ? Table2 : FileText;
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-2 hover:bg-muted",
          active && "bg-muted font-medium",
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {children.length ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen(!open)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-5.5" />
        )}
        <Link
          to="/p/$pageId"
          params={{ pageId: item.id }}
          data-testid="tree-item"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
        >
          {item.icon ? (
            <span aria-hidden>{item.icon}</span>
          ) : (
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate">{item.title || "Untitled"}</span>
        </Link>
      </div>
      {open && children.length ? (
        <ul>
          {children.map((c) => (
            <Node key={c.id} item={c} items={items} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
