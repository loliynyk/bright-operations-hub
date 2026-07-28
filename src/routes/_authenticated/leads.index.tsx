import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, ExternalLink, Archive } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, SearchInput } from "@/components/ds";
import { FilterBar } from "@/components/ds/list-toolbar";
import { InlineStatusSelect } from "@/components/ds/inline-status-select";
import { RowActionsMenu } from "@/components/ds/row-actions-menu";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listLeads, saveLead } from "@/lib/leads.functions";
import { updateLeadStatus } from "@/lib/overview.functions";
import { listLookups } from "@/lib/lookups.functions";
import { statusLabel, sourceLabel, LEAD_STATUSES, LEAD_SOURCES } from "@/lib/leads";
import { useBranch } from "@/lib/branch-context";
import { LeadsFunnel } from "@/components/leads/leads-funnel";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsIndex,
});

const OPEN_STATUSES = new Set(["new", "contacted", "waiting", "trial", "tour_scheduled", "tour_done", "negotiation", "contract"]);

function LeadsIndex() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listLeads);
  const lookupsFn = useServerFn(listLookups);
  const updateStatusFn = useServerFn(updateLeadStatus);
  const saveFn = useServerFn(saveLead);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<any | null>(null);

  const filtered = (leads as any[]).filter((l) => {
    if (statusFilter.length && !statusFilter.includes(l.status)) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (!q) return true;
    const hay = `${l.parent_name ?? ""} ${l.parent_phone ?? ""} ${l.child_name ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const list = leads as any[];
    return {
      open: list.filter((l) => OPEN_STATUSES.has(l.status)).length,
      newMonth: list.filter((l) => (l.registration_date ?? l.created_at ?? "").slice(0, 10) >= monthStart).length,
      trial: list.filter((l) => l.status === "trial" || l.status === "tour_scheduled").length,
      converted: list.filter((l) => l.status === "converted" || l.converted_client_id).length,
      lost: list.filter((l) => l.status === "lost").length,
    };
  }, [leads]);

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateStatusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads", branch.id] }),
  });
  const archiveMutation = useMutation({
    mutationFn: (row: any) =>
      saveFn({ data: { id: row.id, status: "archived", parent_name: row.parent_name } as any }),
    onSuccess: () => { toast.success("Ліда переведено в архів"); qc.invalidateQueries({ queryKey: ["leads", branch.id] }); setArchiving(null); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "created_at",
      header: "Дата",
      sortAccessor: (r) => r.registration_date ?? r.created_at,
      render: (r) => <span className="text-muted-foreground">{formatDate(r.registration_date ?? r.created_at)}</span>,
    },
    {
      key: "parent",
      header: "Батько",
      sortAccessor: (r) => (r.parent_name ?? "").toLowerCase(),
      render: (r) => <span className="font-medium text-foreground">{r.parent_name || "—"}</span>,
    },
    { key: "child", header: "Дитина", render: (r) => <span className="text-muted-foreground">{r.child_name ?? "—"}</span> },
    { key: "phone", header: "Телефон", render: (r) => <span className="text-muted-foreground">{r.parent_phone ?? "—"}</span> },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => statusLabel(r.status),
      render: (r) => (
        <InlineStatusSelect
          value={r.status}
          options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(next) => statusMutation.mutateAsync({ id: r.id, status: next })}
          ariaLabel="Змінити статус"
        />
      ),
    },
    { key: "source", header: "Джерело", render: (r) => <span className="text-muted-foreground">{sourceLabel(r.source)}</span> },
  ];

  const activeFiltersCount =
    (q ? 1 : 0) + (statusFilter.length ? 1 : 0) + (sourceFilter !== "all" ? 1 : 0);

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

      <KpiGrid className="xl:grid-cols-5">
        <MetricCard label="Відкриті" value={String(kpis.open)} icon={UserPlus} tone="primary" />
        <MetricCard label="Нові (міс.)" value={String(kpis.newMonth)} icon={TrendingUp} tone="info" />
        <MetricCard label="Пробні / візити" value={String(kpis.trial)} icon={CalendarCheck} tone="warning" />
        <MetricCard label="Конвертовані" value={String(kpis.converted)} icon={CheckCircle2} tone="success" />
        <MetricCard label="Втрачені" value={String(kpis.lost)} icon={XCircle} tone="danger" />
      </KpiGrid>

      <SectionCard>
        <LeadsFunnel leads={leads as any[]} activeStatuses={statusFilter} onSelectStage={(s) => setStatusFilter(s)} />
        <FilterBar
          hasActive={activeFiltersCount > 0}
          onReset={() => { setQ(""); setStatusFilter([]); setSourceFilter("all"); }}
        >
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
          <Select
            value={statusFilter.length === 1 ? statusFilter[0] : statusFilter.length === 0 ? "all" : "__multi__"}
            onValueChange={(v) => setStatusFilter(v === "all" ? [] : [v])}
          >
            <SelectTrigger className="h-9 md:w-56">
              <SelectValue>
                {statusFilter.length === 0
                  ? "Усі статуси"
                  : statusFilter.length === 1
                    ? statusLabel(statusFilter[0])
                    : `Фільтр (${statusFilter.length})`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 md:w-52">
              <SelectValue>{sourceFilter === "all" ? "Усі джерела" : sourceLabel(sourceFilter)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі джерела</SelectItem>
              {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "created_at", dir: "desc" }}
          emptyText="Лідів не знайдено. Спробуйте змінити фільтри або створіть нового."
          onRowClick={(r) => navigate({ to: "/leads/$id", params: { id: r.id } })}
          rowActions={(r) => (
            <RowActionsMenu
              actions={[
                {
                  label: "Відкрити",
                  icon: <ExternalLink className="h-3.5 w-3.5" />,
                  onSelect: () => navigate({ to: "/leads/$id", params: { id: r.id } }),
                },
                {
                  label: "Перевести в архів",
                  icon: <Archive className="h-3.5 w-3.5" />,
                  destructive: true,
                  disabled: r.status === "archived",
                  separatorBefore: true,
                  onSelect: () => setArchiving(r),
                },
              ]}
            />
          )}
        />
      </SectionCard>

      {archiving ? (
        <ConfirmDeleteDialog
          open={!!archiving}
          onOpenChange={(o) => !o && setArchiving(null)}
          entityName={archiving.parent_name || "лід"}
          variant="archive"
          impact="Лід буде переміщено в архів. Історія та таймлайн збережуться."
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutateAsync(archiving)}
        />
      ) : null}
    </PageContainer>
  );
}

function NewLeadDialog({ lookups, onClose }: { lookups: any; onClose: () => void }) {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveLead);
  const [form, setForm] = useState({
    parent_first_name: "", parent_last_name: "", parent_phone: "", parent_email: "",
    child_first_name: "", child_birthdate: "",
    branch_id: branch.id || "", service_id: "", source: "",
  });
  const mutation = useMutation({
    mutationFn: () => saveFn({ data: {
      ...form,
      branch_id: form.branch_id || null, service_id: form.service_id || null,
      source: form.source || null, child_birthdate: form.child_birthdate || null,
      status: "new",
    } as any }),
    onSuccess: () => { toast.success("Лід створено"); qc.invalidateQueries({ queryKey: ["leads"] }); onClose(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const services = (lookups?.services ?? []).filter((s: any) => !form.branch_id || s.branch_id === form.branch_id);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Новий лід — {branch.name}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ім'я батька"><Input value={form.parent_first_name} onChange={(e) => setForm({ ...form, parent_first_name: e.target.value })} /></Field>
          <Field label="Прізвище"><Input value={form.parent_last_name} onChange={(e) => setForm({ ...form, parent_last_name: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон"><Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ім'я дитини"><Input value={form.child_first_name} onChange={(e) => setForm({ ...form, child_first_name: e.target.value })} /></Field>
          <Field label="Дата народження"><Input type="date" value={form.child_birthdate} onChange={(e) => setForm({ ...form, child_birthdate: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Філія">
            <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v, service_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
              <SelectContent>{(lookups?.branches ?? []).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Послуга">
            <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
              <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
              <SelectContent>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Джерело">
          <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
            <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
            <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Скасувати</Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Створити</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
