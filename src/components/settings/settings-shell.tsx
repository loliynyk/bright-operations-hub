import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Archive, RotateCcw, ExternalLink } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, PrimaryButton, EmptyState } from "@/components/ds";
import { RowActionsMenu } from "@/components/ds/row-actions-menu";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = { header: string; render: (row: T) => ReactNode; className?: string };

export function SettingsShell<T extends { id: string; is_active?: boolean; name?: string }>({
  title,
  description,
  icon,
  listQueryKey,
  listFn,
  archiveFn,
  columns,
  renderForm,
  addLabel = "Додати",
  emptyTitle = "Ще немає записів",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  listQueryKey: unknown[];
  listFn: () => Promise<T[]>;
  archiveFn: (input: { id: string; is_active: boolean }) => Promise<unknown>;
  columns: Column<T>[];
  renderForm: (args: { row: T | null; onDone: () => void }) => ReactNode;
  addLabel?: string;
  emptyTitle?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [confirmingArchive, setConfirmingArchive] = useState<T | null>(null);
  const { data, isLoading } = useQuery({ queryKey: listQueryKey, queryFn: listFn });

  const archive = useMutation({
    mutationFn: archiveFn,
    onSuccess: () => { toast.success("Оновлено"); qc.invalidateQueries({ queryKey: listQueryKey }); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const open = editing !== undefined;
  const close = () => setEditing(undefined);

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        actions={
          <PrimaryButton size="sm" onClick={() => setEditing(null)}>
            <Plus className="mr-1.5 h-4 w-4" /> {addLabel}
          </PrimaryButton>
        }
      />
      <SectionCard>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Завантаження…</p>
        ) : !data || data.length === 0 ? (
          <EmptyState icon={icon} title={emptyTitle} description="Додайте перший запис." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {columns.map((c, i) => <th key={i} className={"py-2 pr-4 " + (c.className ?? "")}>{c.header}</th>)}
                  <th className="py-2 pr-4">Статус</th>
                  <th className="w-12 py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const archived = row.is_active === false;
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      onClick={(e) => {
                        const t = e.target as HTMLElement;
                        if (t.closest('[data-stop="true"], button, a, [role="menuitem"]')) return;
                        setEditing(row);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                          e.preventDefault();
                          setEditing(row);
                        }
                      }}
                      className={cn(
                        "cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40 focus:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                      )}
                    >
                      {columns.map((c, i) => <td key={i} className={"py-2 pr-4 " + (c.className ?? "")}>{c.render(row)}</td>)}
                      <td className="py-2 pr-4">
                        <StatusBadge tone={!archived ? "success" : "neutral"}>
                          {!archived ? "Активний" : "Архів"}
                        </StatusBadge>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Редагувати",
                              icon: <Pencil className="h-3.5 w-3.5" />,
                              onSelect: () => setEditing(row),
                            },
                            {
                              label: archived ? "Відновити" : "Архівувати",
                              icon: archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />,
                              onSelect: () => setConfirmingArchive(row),
                              destructive: !archived,
                              separatorBefore: true,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати" : "Новий запис"}</DialogTitle>
          </DialogHeader>
          {open ? renderForm({ row: editing ?? null, onDone: () => { close(); qc.invalidateQueries({ queryKey: listQueryKey }); } }) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>

      {confirmingArchive ? (
        <ConfirmDeleteDialog
          open={!!confirmingArchive}
          onOpenChange={(o) => !o && setConfirmingArchive(null)}
          entityName={confirmingArchive.name ?? "запис"}
          variant={confirmingArchive.is_active === false ? "restore" : "archive"}
          actionLabel={confirmingArchive.is_active === false ? "Відновити" : "Архівувати"}
          impact={
            confirmingArchive.is_active === false
              ? "Запис знову з'явиться у списках і селекторах."
              : "Запис буде приховано зі списків. Історичні дані та зв'язки збережуться."
          }
          isPending={archive.isPending}
          onConfirm={async () => {
            await archive.mutateAsync({
              id: confirmingArchive.id,
              is_active: confirmingArchive.is_active === false,
            });
            setConfirmingArchive(null);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

// keep an unused re-export to satisfy tree-shaking / historical imports
export { ExternalLink };
