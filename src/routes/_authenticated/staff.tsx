import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Plus, Archive, RotateCcw } from "lucide-react";
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
  const navigate = useNavigate();
  const listFn = useServerFn(listEmployees);
  const saveFn = useServerFn(upsertEmployee);
  const arcFn = useServerFn(archiveEmployee);
  const [creating, setCreating] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["employees", branch.id, includeArchived],
    queryFn: () => listFn({ data: { branch_id: branch.id || null, include_archived: includeArchived } }),
    enabled: !!branch.id,
  });

  const arc = useMutation({
    mutationFn: (v: { id: string; archive: boolean }) => arcFn({ data: v }),
    onSuccess: () => {
      toast.success("Оновлено");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const rows = data as any[];

  const columns: DataTableColumn<any>[] = useMemo(() => [
    {
      key: "employee_number",
      header: "№",
      sortAccessor: (r) => r.employee_number ?? "",
      render: (r) => <span className="text-muted-foreground">{r.employee_number ?? "—"}</span>,
    },
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
      sortAccessor: (r) => r.status ?? "",
      render: (r) => {
        const s = r.status ?? (r.is_active ? "active" : "archived");
        const tone = s === "active" ? "success" : s === "paused" ? "warning" : "neutral";
        const label = s === "active" ? "Активний" : s === "paused" ? "Пауза" : "Архів";
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => {
        const isArchived = r.status === "archived" || r.is_active === false;
        return (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => arc.mutate({ id: r.id, archive: !isArchived })}
          >
            {isArchived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
        );
      },
    },
  ], [arc]);

  return (
    <PageContainer>
      <PageHeader
        title="Працівники"
        description={`Штат філії ${branch.name}.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIncludeArchived((v) => !v)}>
              {includeArchived ? "Приховати архів" : "Показати архів"}
            </Button>
            <PrimaryButton size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Додати
            </PrimaryButton>
          </div>
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
            onRowClick={(row) => navigate({ to: "/staff/$id", params: { id: row.id } })}
          />
        )}
      </SectionCard>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новий працівник</DialogTitle>
          </DialogHeader>
          <QuickEmployeeForm
            branchId={branch.id}
            save={saveFn}
            onCreated={(id) => {
              setCreating(false);
              qc.invalidateQueries({ queryKey: ["employees"] });
              navigate({ to: "/staff/$id", params: { id } });
            }}
          />
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function QuickEmployeeForm({ branchId, save, onCreated }: any) {
  const [v, setV] = useState({
    branch_id: branchId,
    first_name: "",
    last_name: "",
    position: "",
    phone: "",
    email: "",
    status: "active" as const,
  });
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...v,
          full_name: [v.first_name, v.last_name].filter(Boolean).join(" ").trim(),
        },
      }),
    onSuccess: (r: any) => {
      toast.success("Створено");
      onCreated(r.id);
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Імʼя</Label>
          <Input value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} />
        </div>
        <div>
          <Label>Прізвище</Label>
          <Input value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} />
        </div>
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
        <Button onClick={() => m.mutate()} disabled={m.isPending || (!v.first_name && !v.last_name)}>
          Створити
        </Button>
      </div>
    </div>
  );
}
