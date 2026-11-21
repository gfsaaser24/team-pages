import { Link, useRouter } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, Filter as FilterIcon, ListOrdered, MoreHorizontal, Plus, Settings2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { EmptyState } from "@/client/components/EmptyState";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/client/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import {
  OPERATOR_LABELS,
  PROPERTY_LABELS,
  PROPERTY_TYPES,
  TITLE_ID,
  applyView,
  hasChoices,
  needsValue,
  operatorsFor,
  type Filter,
  type Property,
  type PropertyType,
  type Sort,
  type Value,
  type ViewConfig,
} from "@/lib/model";
import {
  addProperty,
  addView,
  createRow,
  deleteProperty,
  deleteView,
  updateProperty,
  updateRow,
  updateView,
} from "@/serverFunctions/databases";
import { CommitInput, PropertyInput, type Person } from "./PropertyInput";

type Layout = "table" | "board" | "calendar" | "list";
interface View {
  id: string;
  name: string;
  layout: Layout;
  config: ViewConfig;
}
interface Row {
  id: string;
  title: string;
  icon: string | null;
  props: Record<string, Value>;
}
export interface DatabaseData {
  properties: Property[];
  views: View[];
  rows: Row[];
}

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
  { value: "list", label: "List" },
];

const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : "Something went wrong");

export function DatabaseView({
  databaseId,
  data,
  people,
  canEdit,
}: {
  databaseId: string;
  data: DatabaseData;
  people: Person[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [viewId, setViewId] = useState(data.views[0]?.id);
  const [dialog, setDialog] = useState<"properties" | "view" | null>(null);
  // Filters, sorts and columns apply at once; the server copy follows.
  const [pendingConfig, setPendingConfig] = useState<Record<string, ViewConfig>>({});
  const saved = data.views.find((v) => v.id === viewId) ?? data.views[0]!;
  const view = { ...saved, config: pendingConfig[saved.id] ?? saved.config };
  const props = data.properties;
  const shown = props.filter((p) => !(view.config.hidden ?? []).includes(p.id));
  const rows = applyView(data.rows, view.config, props);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await action();
      await router.invalidate();
      return result;
    } catch (error) {
      fail(error);
      return undefined;
    }
  }
  const setValue = (rowId: string, propertyId: string, value: Value) =>
    run(() => updateRow({ data: { id: rowId, props: { [propertyId]: value } } }));
  const setTitle = (rowId: string, title: string) => run(() => updateRow({ data: { id: rowId, title } }));
  const newRow = (values: Record<string, Value> = {}) =>
    run(() => createRow({ data: { databaseId, props: values } }));
  const setConfig = (config: ViewConfig) => {
    setPendingConfig((p) => ({ ...p, [view.id]: config }));
    return run(() => updateView({ data: { id: view.id, config } }));
  };

  const ctx: Ctx = { props, shown, rows, people, canEdit, setValue, setTitle, newRow, view, setConfig };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex flex-wrap items-center gap-1">
          {data.views.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === view.id ? "secondary" : "ghost"}
              data-testid="view-tab"
              onClick={() => setViewId(v.id)}
            >
              {v.name}
            </Button>
          ))}
          {canEdit ? (
            <>
              <ViewMenu view={view} canDelete={data.views.length > 1} run={run} onDeleted={() => setViewId(data.views[0]?.id)} />
              <Button size="sm" variant="ghost" data-testid="add-view" onClick={() => setDialog("view")} aria-label="Add view">
                <Plus />
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {view.layout === "board" ? (
            <SimpleSelect
              testId="group-by"
              label="Group by"
              value={view.config.groupBy ?? null}
              disabled={!canEdit}
              options={props.filter((p) => p.type === "select" || p.type === "status").map((p) => ({ value: p.id, label: `Group by ${p.name}` }))}
              onChange={(v) => setConfig({ ...view.config, groupBy: v })}
            />
          ) : null}
          {view.layout === "calendar" ? (
            <SimpleSelect
              testId="date-property"
              label="Date property"
              value={view.config.dateProperty ?? null}
              disabled={!canEdit}
              options={props.filter((p) => p.type === "date").map((p) => ({ value: p.id, label: `By ${p.name}` }))}
              onChange={(v) => setConfig({ ...view.config, dateProperty: v })}
            />
          ) : null}
          <FilterMenu ctx={ctx} />
          <SortMenu ctx={ctx} />
          <Button size="sm" variant="ghost" data-testid="properties-button" onClick={() => setDialog("properties")}>
            <Settings2 data-icon="inline-start" />
            Properties
          </Button>
          {canEdit ? (
            <Button size="sm" data-testid="new-row" onClick={() => newRow()}>
              <Plus data-icon="inline-start" />
              New
            </Button>
          ) : null}
        </div>
      </div>
      {view.layout === "table" ? <TableLayout ctx={ctx} /> : null}
      {view.layout === "board" ? <BoardLayout ctx={ctx} /> : null}
      {view.layout === "calendar" ? <CalendarLayout ctx={ctx} /> : null}
      {view.layout === "list" ? <ListLayout ctx={ctx} /> : null}
      {dialog === "properties" ? (
        <PropertiesDialog ctx={ctx} databaseId={databaseId} run={run} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "view" ? (
        <AddViewDialog
          databaseId={databaseId}
          onClose={() => setDialog(null)}
          onAdded={(id) => {
            setViewId(id);
            setDialog(null);
          }}
          run={run}
        />
      ) : null}
    </div>
  );
}

interface Ctx {
  props: Property[];
  shown: Property[];
  rows: Row[];
  people: Person[];
  canEdit: boolean;
  view: View;
  setValue: (rowId: string, propertyId: string, value: Value) => Promise<unknown>;
  setTitle: (rowId: string, title: string) => Promise<unknown>;
  newRow: (values?: Record<string, Value>) => Promise<unknown>;
  setConfig: (config: ViewConfig) => Promise<unknown>;
}
type Run = <T>(action: () => Promise<T>) => Promise<T | undefined>;

function OpenRow({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  return (
    <Link to="/p/$pageId" params={{ pageId: id }} className={className} aria-label={children ? undefined : "Open"}>
      {children ?? <ArrowUpRight className="size-4" />}
    </Link>
  );
}

function TableLayout({ ctx }: { ctx: Ctx }) {
  if (!ctx.rows.length && ctx.view.config.filters?.length)
    return <EmptyState kind="filtered" title="No rows match these filters" />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table data-testid="db-table">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Name</TableHead>
            {ctx.shown.map((p) => (
              <TableHead key={p.id} className="min-w-36">
                {p.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ctx.rows.map((r) => (
            <TableRow key={r.id} data-testid="db-row">
              <TableCell>
                <div className="flex items-center gap-1">
                  {r.icon ? <span aria-hidden>{r.icon}</span> : null}
                  <CommitInput
                    testId="cell-title"
                    label="Name"
                    value={r.title}
                    placeholder="Untitled"
                    readOnly={!ctx.canEdit}
                    onCommit={(t) => ctx.setTitle(r.id, t)}
                    className="font-medium"
                  />
                  <OpenRow id={r.id} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" />
                </div>
              </TableCell>
              {ctx.shown.map((p) => (
                <TableCell key={p.id}>
                  <PropertyInput
                    property={p}
                    value={r.props[p.id]}
                    people={ctx.people}
                    canEdit={ctx.canEdit}
                    testId={`cell-${p.name}`}
                    onChange={(v) => ctx.setValue(r.id, p.id, v)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {!ctx.rows.length ? (
            <TableRow>
              <TableCell colSpan={ctx.shown.length + 1} className="py-6 text-center text-muted-foreground">
                No rows yet
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function CardFields({ ctx, row, skip }: { ctx: Ctx; row: Row; skip?: string }) {
  const parts = ctx.shown
    .filter((p) => p.id !== skip && row.props[p.id] !== undefined && row.props[p.id] !== null)
    .map((p) => {
      const v = row.props[p.id]!;
      if (p.type === "person") return ctx.people.find((u) => u.id === v)?.email ?? "";
      if (p.type === "checkbox") return v ? p.name : "";
      if (hasChoices(p.type))
        return (Array.isArray(v) ? v : [v]).map((id) => p.options.find((o) => o.id === id)?.name ?? "").join(", ");
      return String(v);
    })
    .filter(Boolean);
  return parts.length ? <div className="text-xs text-muted-foreground">{parts.join(" · ")}</div> : null;
}

function BoardLayout({ ctx }: { ctx: Ctx }) {
  const group = ctx.props.find((p) => p.id === ctx.view.config.groupBy);
  const [dragging, setDragging] = useState<string | null>(null);
  if (!group) return <EmptyState title="Choose a select or status property to group by" />;
  const columns = [...group.options.map((o) => ({ id: o.id as string | null, name: o.name })), { id: null, name: `No ${group.name}` }];
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const cards = ctx.rows.filter((r) => (r.props[group.id] ?? null) === col.id);
        return (
          <section
            key={col.id ?? "none"}
            data-testid="board-column"
            className="w-64 shrink-0 space-y-2 rounded-lg bg-muted/50 p-2"
            onDragOver={(e) => ctx.canEdit && e.preventDefault()}
            onDrop={() => {
              if (dragging) void ctx.setValue(dragging, group.id, col.id);
              setDragging(null);
            }}
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-medium">{col.name}</h3>
              <span className="text-xs text-muted-foreground">{cards.length}</span>
            </div>
            {cards.map((r) => (
              <div
                key={r.id}
                data-testid="board-card"
                draggable={ctx.canEdit}
                onDragStart={() => setDragging(r.id)}
                className="space-y-1 rounded-md border border-border bg-card p-2 text-sm shadow-xs"
              >
                <div className="flex items-start justify-between gap-1">
                  <OpenRow id={r.id} className="min-w-0 flex-1 font-medium hover:underline">
                    {r.icon ? `${r.icon} ` : ""}
                    {r.title || "Untitled"}
                  </OpenRow>
                  {ctx.canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button type="button" data-testid="card-menu" aria-label="Move card" className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                            <MoreHorizontal className="size-4" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {columns
                            .filter((c) => c.id !== col.id)
                            .map((c) => (
                              <DropdownMenuItem key={c.id ?? "none"} onClick={() => ctx.setValue(r.id, group.id, c.id)}>
                                {c.name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <CardFields ctx={ctx} row={r} skip={group.id} />
              </div>
            ))}
            {ctx.canEdit ? (
              <Button size="xs" variant="ghost" className="w-full justify-start" onClick={() => ctx.newRow(col.id ? { [group.id]: col.id } : {})}>
                <Plus data-icon="inline-start" />
                New
              </Button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarLayout({ ctx }: { ctx: Ctx }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const dateProp = ctx.props.find((p) => p.id === ctx.view.config.dateProperty);
  if (!dateProp) return <EmptyState title="Choose a date property for this calendar" />;
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = iso(new Date());
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft />
        </Button>
        <h3 className="min-w-36 text-center text-sm font-medium">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border text-sm">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = iso(d);
          const items = ctx.rows.filter((r) => r.props[dateProp.id] === key);
          return (
            <div
              key={key}
              data-testid="calendar-day"
              data-date={key}
              className={cn(
                "group min-h-24 space-y-1 border-r border-b border-border p-1",
                d.getMonth() !== month.getMonth() && "bg-muted/40 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("px-1 text-xs", key === today && "rounded bg-primary text-primary-foreground")}>{d.getDate()}</span>
                {ctx.canEdit ? (
                  <button
                    type="button"
                    data-testid="calendar-add"
                    aria-label={`New on ${key}`}
                    onClick={() => ctx.newRow({ [dateProp.id]: key })}
                    className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
                  >
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {items.map((r) => (
                <OpenRow key={r.id} id={r.id} className="block truncate rounded bg-card px-1.5 py-0.5 text-xs shadow-xs hover:bg-muted">
                  <span data-testid="calendar-item">{r.title || "Untitled"}</span>
                </OpenRow>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListLayout({ ctx }: { ctx: Ctx }) {
  if (!ctx.rows.length) return <EmptyState title="No rows yet" kind={ctx.view.config.filters?.length ? "filtered" : "no-data"} />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {ctx.rows.map((r) => (
        <li key={r.id} data-testid="list-item" className="flex items-center gap-3 px-3 py-2">
          <OpenRow id={r.id} className="min-w-0 flex-1 truncate font-medium hover:underline">
            {r.icon ? `${r.icon} ` : ""}
            {r.title || "Untitled"}
          </OpenRow>
          <CardFields ctx={ctx} row={r} />
        </li>
      ))}
    </ul>
  );
}

function propertyOptions(ctx: Ctx) {
  return [{ value: TITLE_ID, label: "Name" }, ...ctx.props.map((p) => ({ value: p.id, label: p.name }))];
}
function typeOf(ctx: Ctx, id: string): PropertyType | "title" {
  return id === TITLE_ID ? "title" : (ctx.props.find((p) => p.id === id)?.type ?? "text");
}

function FilterMenu({ ctx }: { ctx: Ctx }) {
  const filters = ctx.view.config.filters ?? [];
  const save = (next: Filter[]) => ctx.setConfig({ ...ctx.view.config, filters: next });
  const change = (i: number, f: Filter) => save(filters.map((x, j) => (j === i ? f : x)));
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant={filters.length ? "secondary" : "ghost"} data-testid="filter-button">
            <FilterIcon data-icon="inline-start" />
            Filter{filters.length ? ` (${filters.length})` : ""}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto max-w-[min(36rem,95vw)] space-y-2">
        {filters.map((f, i) => {
          const type = typeOf(ctx, f.propertyId);
          const prop = ctx.props.find((p) => p.id === f.propertyId);
          const valueOptions =
            prop && hasChoices(prop.type)
              ? prop.options.map((o) => ({ value: o.id, label: o.name }))
              : prop?.type === "person"
                ? ctx.people.map((u) => ({ value: u.id, label: u.email }))
                : null;
          return (
            <div key={i} className="flex flex-wrap items-center gap-1">
              <SimpleSelect
                testId="filter-property"
                label="Property"
                value={f.propertyId}
                options={propertyOptions(ctx)}
                disabled={!ctx.canEdit}
                onChange={(v) => change(i, { propertyId: v, operator: operatorsFor(typeOf(ctx, v))[0]! })}
              />
              <SimpleSelect
                testId="filter-operator"
                label="Condition"
                value={f.operator}
                disabled={!ctx.canEdit}
                options={operatorsFor(type).map((o) => ({ value: o, label: OPERATOR_LABELS[o] }))}
                onChange={(v) => change(i, { ...f, operator: v as Filter["operator"] })}
              />
              {needsValue(f.operator) ? (
                valueOptions ? (
                  <SimpleSelect
                    testId="filter-value"
                    label="Value"
                    value={f.value ?? null}
                    placeholder="Choose"
                    disabled={!ctx.canEdit}
                    options={valueOptions}
                    onChange={(v) => change(i, { ...f, value: v })}
                  />
                ) : (
                  <CommitInput
                    testId="filter-value"
                    label="Value"
                    type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                    value={f.value ?? ""}
                    readOnly={!ctx.canEdit}
                    className="w-36 border-input"
                    onCommit={(v) => change(i, { ...f, value: v })}
                  />
                )
              ) : null}
              {ctx.canEdit ? (
                <Button size="icon-sm" variant="ghost" data-testid="remove-filter" aria-label="Remove filter" onClick={() => save(filters.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              ) : null}
            </div>
          );
        })}
        {!filters.length ? <p className="text-sm text-muted-foreground">No filters</p> : null}
        {ctx.canEdit ? (
          <Button size="sm" variant="outline" data-testid="add-filter" onClick={() => save([...filters, { propertyId: TITLE_ID, operator: "contains", value: "" }])}>
            <Plus data-icon="inline-start" />
            Add filter
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SortMenu({ ctx }: { ctx: Ctx }) {
  const sorts = ctx.view.config.sorts ?? [];
  const save = (next: Sort[]) => ctx.setConfig({ ...ctx.view.config, sorts: next });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant={sorts.length ? "secondary" : "ghost"} data-testid="sort-button">
            <ListOrdered data-icon="inline-start" />
            Sort{sorts.length ? ` (${sorts.length})` : ""}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto space-y-2">
        {sorts.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <SimpleSelect
              testId="sort-property"
              label="Property"
              value={s.propertyId}
              options={propertyOptions(ctx)}
              disabled={!ctx.canEdit}
              onChange={(v) => save(sorts.map((x, j) => (j === i ? { ...x, propertyId: v } : x)))}
            />
            <SimpleSelect
              testId="sort-direction"
              label="Direction"
              value={s.direction}
              disabled={!ctx.canEdit}
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
              onChange={(v) => save(sorts.map((x, j) => (j === i ? { ...x, direction: v as Sort["direction"] } : x)))}
            />
            {ctx.canEdit ? (
              <Button size="icon-sm" variant="ghost" aria-label="Remove sort" onClick={() => save(sorts.filter((_, j) => j !== i))}>
                <X />
              </Button>
            ) : null}
          </div>
        ))}
        {!sorts.length ? <p className="text-sm text-muted-foreground">No sorts</p> : null}
        {ctx.canEdit ? (
          <Button size="sm" variant="outline" data-testid="add-sort" onClick={() => save([...sorts, { propertyId: TITLE_ID, direction: "asc" }])}>
            <Plus data-icon="inline-start" />
            Add sort
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ViewMenu({ view, canDelete, run, onDeleted }: { view: View; canDelete: boolean; run: Run; onDeleted: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.name);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="icon-sm" variant="ghost" aria-label="View options">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setName(view.name);
                setRenaming(true);
              }}
            >
              Rename view
            </DropdownMenuItem>
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    await run(() => deleteView({ data: { id: view.id } }));
                    onDeleted();
                  }}
                >
                  Delete view
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming ? (
        <Dialog open onOpenChange={(o) => !o && setRenaming(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename view</DialogTitle>
            </DialogHeader>
            <Input aria-label="View name" value={name} onChange={(e) => setName(e.target.value)} />
            <DialogFooter>
              <Button
                disabled={!name.trim()}
                onClick={async () => {
                  await run(() => updateView({ data: { id: view.id, name } }));
                  setRenaming(false);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function AddViewDialog({ databaseId, onClose, onAdded, run }: { databaseId: string; onClose: () => void; onAdded: (id: string) => void; run: Run }) {
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<Layout>("table");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add view</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" data-testid="view-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Layout</Label>
            <SimpleSelect testId="view-layout" label="Layout" value={layout} options={LAYOUTS} size="default" className="w-full" onChange={(v) => setLayout(v as Layout)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            pending={busy}
            onClick={async () => {
              setBusy(true);
              const res = await run(() => addView({ data: { databaseId, name, layout } }));
              setBusy(false);
              if (res) onAdded(res.id);
            }}
          >
            Add view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_OPTIONS = PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_LABELS[t] }));

function PropertiesDialog({ ctx, databaseId, run, onClose }: { ctx: Ctx; databaseId: string; run: Run; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const hidden = ctx.view.config.hidden ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Properties</DialogTitle>
        </DialogHeader>
        <ul className="space-y-3">
          {ctx.props.map((p) => (
            <li key={p.id} data-testid="property" className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <CommitInput
                  testId="property-name"
                  label="Property name"
                  value={p.name}
                  readOnly={!ctx.canEdit}
                  className="min-w-0 flex-1 border-input"
                  onCommit={(v) => v.trim() && run(() => updateProperty({ data: { id: p.id, name: v } }))}
                />
                <SimpleSelect
                  testId="property-type"
                  label="Type"
                  value={p.type}
                  disabled={!ctx.canEdit}
                  options={TYPE_OPTIONS}
                  onChange={(v) => run(() => updateProperty({ data: { id: p.id, type: v as PropertyType } }))}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={!hidden.includes(p.id)}
                    disabled={!ctx.canEdit}
                    onCheckedChange={(c) =>
                      ctx.setConfig({ ...ctx.view.config, hidden: c ? hidden.filter((h) => h !== p.id) : [...hidden, p.id] })
                    }
                  />
                  Shown
                </label>
                {ctx.canEdit ? (
                  <Button size="sm" variant="ghost" onClick={() => run(() => deleteProperty({ data: { id: p.id } }))}>
                    Delete
                  </Button>
                ) : null}
              </div>
              {hasChoices(p.type) ? (
                <CommitInput
                  testId="property-options"
                  label="Options"
                  placeholder="Options, separated by commas"
                  readOnly={!ctx.canEdit}
                  className="border-input"
                  value={p.options.map((o) => o.name).join(", ")}
                  onCommit={(v) => {
                    const names = [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))];
                    const options = names.map((n) => p.options.find((o) => o.name === n) ?? { id: crypto.randomUUID(), name: n });
                    return run(() => updateProperty({ data: { id: p.id, options } }));
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {ctx.canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Input
              data-testid="new-property-name"
              aria-label="New property name"
              placeholder="Property name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <SimpleSelect testId="new-property-type" label="Type" value={type} options={TYPE_OPTIONS} size="default" onChange={(v) => setType(v as PropertyType)} />
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                const res = await run(() => addProperty({ data: { databaseId, name, type } }));
                if (res) setName("");
              }}
            >
              Add property
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
