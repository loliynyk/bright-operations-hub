import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, PrimaryButton, EmptyState } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";

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
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    {columns.map((c, i) => <td key={i} className={"py-2 pr-4 " + (c.className ?? "")}>{c.render(row)}</td>)}
                    <td className="py-2 pr-4">
                      <StatusBadge tone={row.is_active !== false ? "success" : "neutral"}>
                        {row.is_active !== false ? "Активний" : "Архів"}
                      </StatusBadge>
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => archive.mutate({ id: row.id, is_active: row.is_active === false })}
                        >
                          {row.is_active === false
                            ? <RotateCcw className="h-3.5 w-3.5" />
                            : <Archive className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
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
    </PageContainer>
  );
}
