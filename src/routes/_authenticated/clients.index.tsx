import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, UserCheck, PauseCircle, Archive, ExternalLink, ArchiveRestore } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, SearchInput, MetricCard } from "@/components/ds";
import { OriginBadge } from "@/components/ds/related-records";
import { KpiGrid } from "@/components/ds/kpi-grid";
import { FilterBar } from "@/components/ds/list-toolbar";
import { InlineStatusSelect } from "@/components/ds/inline-status-select";
import { RowActionsMenu } from "@/components/ds/row-actions-menu";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/lib/branch-context";
import { listClients } from "@/lib/clients.functions";
import { updateClientStatus } from "@/lib/overview.functions";
import { CLIENT_STATUSES } from "@/lib/leads";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndex,
});

const STATUS_LABEL: Record<string, string> = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s.label]));

function ClientsIndex() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listClients);
  const updateFn = useServerFn(updateClientStatus);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [archiving, setArchiving] = useState<any | null>(null);
  const [restoring, setRestoring] = useState<any | null>(null);

  const list = clients as any[];
  const kpis = useMemo(() => ({
    total: list.length,
    active: list.filter((c) => c.status === "active").length,
    paused: list.filter((c) => c.status === "paused").length,
    archived: list.filter((c) => c.status === "archived").length,
  }), [list]);

  const filtered = list.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!q) return true;
    return `${c.parent_first_name} ${c.parent_last_name} ${c.phone ?? ""} ${c.email ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", branch.id] }),
  });
  const archiveMutation = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.status === "archived" ? "Клієнта архівовано" : "Клієнта відновлено");
      qc.invalidateQueries({ queryKey: ["clients", branch.id] });
      setArchiving(null); setRestoring(null);
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "start_date",
      header: "Початок навчання",
      sortAccessor: (r) => r.start_date ?? "",
      render: (r) => <span className="text-muted-foreground">{formatDate(r.start_date)}</span>,
    },
    {
      key: "client",
      header: "Клієнт",
      sortAccessor: (r) => `${r.parent_last_name ?? ""} ${r.parent_first_name ?? ""}`.toLowerCase(),
      render: (r) => <span className="font-medium text-foreground">{r.parent_first_name} {r.parent_last_name}</span>,
    },
    { key: "phone", header: "Телефон", render: (r) => <span className="text-muted-foreground">{r.phone ?? "—"}</span> },
    {
      key: "children",
      header: "Діти",
      sortAccessor: (r) => r.active_child_count ?? 0,
      render: (r) => (
        <span className="text-muted-foreground">
          {r.active_child_count ?? 0}
          {r.child_count && r.child_count !== r.active_child_count ? ` / ${r.child_count}` : ""}
        </span>
      ),
    },
    {
      key: "origin",
      header: "Джерело",
      sortAccessor: (r) => (r.lead_id ? "1" : "0"),
      render: (r) => <OriginBadge leadId={r.lead_id} />,
    },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => r.status ?? "",
      render: (r) => (
        <InlineStatusSelect
          value={r.status}
          options={CLIENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(next) => statusMutation.mutateAsync({ id: r.id, status: next })}
          ariaLabel="Змінити статус клієнта"
        />
      ),
    },
  ];

  const activeCount = (q ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  return (
    <PageContainer>
      <PageHeader title="Клієнти" description="Батьки, з якими укладено співпрацю." />

      <KpiGrid className="xl:grid-cols-4">
        <MetricCard label="Усього клієнтів" value={String(kpis.total)} icon={Users} tone="primary" />
        <MetricCard label="Активні" value={String(kpis.active)} icon={UserCheck} tone="success" />
        <MetricCard label="Призупинені" value={String(kpis.paused)} icon={PauseCircle} tone="warning" />
        <MetricCard label="Архів" value={String(kpis.archived)} icon={Archive} tone="neutral" />
      </KpiGrid>

      <SectionCard>
        <FilterBar
          hasActive={activeCount > 0}
          onReset={() => { setQ(""); setStatusFilter("all"); }}
        >
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 md:w-52">
              <SelectValue>{statusFilter === "all" ? "Усі статуси" : STATUS_LABEL[statusFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {CLIENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "start_date", dir: "desc" }}
          emptyText="Клієнтів не знайдено."
          onRowClick={(r) => navigate({ to: "/clients/$id", params: { id: r.id } })}
          rowActions={(r) => (
            <RowActionsMenu
              actions={[
                { label: "Відкрити", icon: <ExternalLink className="h-3.5 w-3.5" />, onSelect: () => navigate({ to: "/clients/$id", params: { id: r.id } }) },
                r.status !== "archived"
                  ? { label: "Перевести в архів", icon: <Archive className="h-3.5 w-3.5" />, destructive: true, separatorBefore: true, onSelect: () => setArchiving(r) }
                  : { label: "Відновити", icon: <ArchiveRestore className="h-3.5 w-3.5" />, separatorBefore: true, onSelect: () => setRestoring(r) },
              ]}
            />
          )}
        />
      </SectionCard>

      {archiving ? (
        <ConfirmDeleteDialog
          open={!!archiving}
          onOpenChange={(o) => !o && setArchiving(null)}
          entityName={`${archiving.parent_first_name} ${archiving.parent_last_name}`}
          variant="archive"
          impact="Клієнта буде приховано зі списків. Договори та історія платежів збережуться."
          actionLabel="Архівувати"
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutateAsync({ id: archiving.id, status: "archived" })}
        />
      ) : null}
      {restoring ? (
        <ConfirmDeleteDialog
          open={!!restoring}
          onOpenChange={(o) => !o && setRestoring(null)}
          entityName={`${restoring.parent_first_name} ${restoring.parent_last_name}`}
          variant="restore"
          actionLabel="Відновити"
          isPending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutateAsync({ id: restoring.id, status: "active" })}
        />
      ) : null}
    </PageContainer>
  );
}
