import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Plus, Archive, RotateCcw, Pencil } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, StatusBadge, EmptyState } from "@/components/ds";
import { DataTable, type DataTableColumn } from "@/components/ds/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBranch } from "@/lib/branch-context";
import { listEmployees, upsertEmployee, archiveEmployee } from "@/lib/employees.functions";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
  head: () => ({
    meta: [
      { title: "Працівники — Bright OS" },
      { name: "description", content: "Штат філії: педагоги, менеджери, адміністратори." },
    ],
  }),
});

function StaffPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployees);
  const saveFn = useServerFn(upsertEmployee);
  const arcFn = useServerFn(archiveEmployee);
  const [editing, setEditing] = useState<any | null | undefined>(undefined);

  const { data = [], isLoading } = useQuery({
    queryKey: ["employees", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });

  const arc = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => arcFn({ data: v }),
    onSuccess: () => {
      toast.success("Оновлено");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });


  const columns: DataTableColumn<any>[] = [
    {
      key: "full_name",
      header: "ПІБ",
      sortAccessor: (r) => (r.full_name ?? "").toLowerCase(),
      render: (r) => <span className="font-medium">{r.full_name}</span>,
    },
    {
      key: "position",
      header: "Посада",
      sortAccessor: (r) => r.position ?? "",
      render: (r) => <span className="text-muted-foreground">{r.position ?? "—"}</span>,
    },
    { key: "phone", header: "Телефон", render: (r) => <span className="text-muted-foreground">{r.phone ?? "—"}</span> },
    { key: "email", header: "Email", render: (r) => <span className="text-muted-foreground">{r.email ?? "—"}</span> },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => (r.is_active ? "1" : "0"),
      render: (r) => (
        <StatusBadge tone={r.is_active ? "success" : "neutral"}>
          {r.is_active ? "Активний" : "Архів"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => arc.mutate({ id: r.id, is_active: !r.is_active })}
          >
            {r.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ),
    },
  ];

  const rows = data as any[];
  return (
    <PageContainer>
      <PageHeader
        title="Працівники"
        description={`Штат філії ${branch.name}.`}
        actions={
          <PrimaryButton size="sm" onClick={() => setEditing(null)}>
            <Plus className="mr-1.5 h-4 w-4" /> Додати
          </PrimaryButton>
        }
      />
      <SectionCard>
        {!isLoading && rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Ще немає працівників"
            description="Додайте першого педагога чи менеджера."
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            isLoading={isLoading}
            defaultSort={{ key: "full_name", dir: "asc" }}
            emptyText="Немає працівників"
          />
        )}
      </SectionCard>

      <Dialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Редагувати" : "Новий працівник"}</DialogTitle>
          </DialogHeader>
          {editing !== undefined ? (
            <EmployeeForm
              row={editing ?? null}
              branchId={branch.id}
              save={saveFn}
              onDone={() => {
                setEditing(undefined);
                qc.invalidateQueries({ queryKey: ["employees"] });
              }}
            />
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function EmployeeForm({ row, branchId, save, onDone }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? branchId,
    full_name: row?.full_name ?? "",
    position: row?.position ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({
    mutationFn: () => save({ data: v }),
    onSuccess: () => {
      toast.success("Збережено");
      onDone();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  return (
    <div className="grid gap-3">
      <div>
        <Label>ПІБ</Label>
        <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
      </div>
      <div>
        <Label>Посада</Label>
        <Input value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Телефон</Label>
          <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => m.mutate()} disabled={m.isPending || !v.full_name}>
          Зберегти
        </Button>
      </div>
    </div>
  );
}
