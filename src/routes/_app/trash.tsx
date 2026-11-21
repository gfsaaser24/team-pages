import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { formatTime } from "@/client/lib/format";
import { deletePage, getTrash, restorePage } from "@/serverFunctions/pages";

export const Route = createFileRoute("/_app/trash")({
  loader: () => getTrash(),
  component: Trash,
});

function Trash() {
  const items = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);

  async function run(id: string, action: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await action();
      await router.invalidate();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <>
      <PageHeader title="Trash" />
      {items.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((p) => (
            <li key={p.id} data-testid="trash-item" className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {p.icon ? `${p.icon} ` : ""}
                  {p.title || "Untitled"}
                </div>
                <div className="text-xs text-muted-foreground">Moved to Trash {formatTime(p.archivedAt)}</div>
              </div>
              {p.canRestore ? (
                <Button
                  size="sm"
                  variant="outline"
                  pending={busy === p.id && !confirm}
                  onClick={() => run(p.id, () => restorePage({ data: { id: p.id } }), "Page restored")}
                >
                  Restore
                </Button>
              ) : null}
              {p.canDelete ? (
                <Button size="sm" variant="destructive" onClick={() => setConfirm({ id: p.id, title: p.title })}>
                  Delete
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Trash is empty" />
      )}
      {confirm ? (
        <ConfirmDialog
          title={`Delete “${confirm.title || "Untitled"}” for good?`}
          confirmLabel="Delete"
          destructive
          pending={busy === confirm.id}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(confirm.id, () => deletePage({ data: { id: confirm.id } }), "Page deleted")}
        >
          Its sub-pages, comments, history and files are deleted too.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
