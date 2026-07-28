import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, SearchInput } from "@/components/ds";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLeads, saveLead } from "@/lib/leads.functions";
import { listLookups } from "@/lib/lookups.functions";
import { statusLabel, statusTone, sourceLabel, LEAD_STATUSES, LEAD_SOURCES } from "@/lib/leads";
import { useBranch } from "@/lib/branch-context";
import { LeadsFunnel } from "@/components/leads/leads-funnel";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsIndex,
});

function LeadsIndex() {
  const { branch } = useBranch();
  const listFn = useServerFn(listLeads);
  const lookupsFn = useServerFn(listLookups);
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const filtered = (leads as any[]).filter((l) => {
    if (status !== "all" && l.status !== status) return false;
    if (!q) return true;
    const hay = `${l.parent_name ?? ""} ${l.parent_phone ?? ""} ${l.child_name ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "created_at",
      header: "Дата створення",
      sortAccessor: (r) => r.registration_date ?? r.created_at,
      render: (r) => (
        <span className="text-muted-foreground">{formatDate(r.registration_date ?? r.created_at)}</span>
      ),
    },
    {
      key: "parent",
      header: "Батько",
      sortAccessor: (r) => (r.parent_name ?? "").toLowerCase(),
      render: (r) => (
        <Link to="/leads/$id" params={{ id: r.id }} className="font-medium text-foreground hover:underline">
          {r.parent_name || "—"}
        </Link>
      ),
    },
    { key: "child", header: "Дитина", render: (r) => <span className="text-muted-foreground">{r.child_name ?? "—"}</span> },
    { key: "phone", header: "Телефон", render: (r) => <span className="text-muted-foreground">{r.parent_phone ?? "—"}</span> },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => statusLabel(r.status),
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(r.status)}`}>
          {statusLabel(r.status)}
        </span>
      ),
    },
    { key: "source", header: "Джерело", render: (r) => <span className="text-muted-foreground">{sourceLabel(r.source)}</span> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Ліди"
        description="Заявки та вхідні звернення від батьків."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <PrimaryButton>
                <Plus className="mr-2 h-4 w-4" /> Створити ліда
              </PrimaryButton>
            </DialogTrigger>
            <NewLeadDialog lookups={lookups} onClose={() => setOpen(false)} />
          </Dialog>
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "created_at", dir: "desc" }}
          emptyText="Лідів не знайдено. Спробуйте змінити фільтри або створіть нового."
        />
      </SectionCard>
    </PageContainer>
  );
}

function NewLeadDialog({ lookups, onClose }: { lookups: any; onClose: () => void }) {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveLead);
  const [form, setForm] = useState({
    parent_first_name: "",
    parent_last_name: "",
    parent_phone: "",
    parent_email: "",
    child_first_name: "",
    child_birthdate: "",
    branch_id: branch.id || "",
    service_id: "",
    source: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...form,
          branch_id: form.branch_id || null,
          service_id: form.service_id || null,
          source: form.source || null,
          child_birthdate: form.child_birthdate || null,
          status: "new",
        } as any,
      }),
    onSuccess: () => {
      toast.success("Лід створено");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const services = (lookups?.services ?? []).filter((s: any) => !form.branch_id || s.branch_id === form.branch_id);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Новий лід — {branch.name}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ім'я батька">
            <Input value={form.parent_first_name} onChange={(e) => setForm({ ...form, parent_first_name: e.target.value })} />
          </Field>
          <Field label="Прізвище">
            <Input value={form.parent_last_name} onChange={(e) => setForm({ ...form, parent_last_name: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон">
            <Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ім'я дитини">
            <Input value={form.child_first_name} onChange={(e) => setForm({ ...form, child_first_name: e.target.value })} />
          </Field>
          <Field label="Дата народження">
            <Input type="date" value={form.child_birthdate} onChange={(e) => setForm({ ...form, child_birthdate: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Філія">
            <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v, service_id: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть..." />
              </SelectTrigger>
              <SelectContent>
                {(lookups?.branches ?? []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Послуга">
            <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть..." />
              </SelectTrigger>
              <SelectContent>
                {services.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Джерело">
          <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Оберіть..." />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Скасувати
        </Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Створити
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
