import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ds";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/lib/branch-context";
import { listContracts } from "@/lib/contracts.functions";
import { contractStatusLabel } from "@/lib/child-validation";

export const Route = createFileRoute("/_authenticated/finance/contracts")({
  component: ContractsPage,
  head: () => ({
    meta: [
      { title: "Договори — Bright OS" },
      { name: "description", content: "Договори з клієнтами у розрізі філії." },
    ],
  }),
});

function ContractsPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listContracts);
  const [status, setStatus] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["contracts", branch.id, status],
    queryFn: () =>
      fn({ data: { branch_id: branch.id || null, status: status === "all" ? null : status } }),
    enabled: !!branch.id,
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "number",
      header: "№ договору",
      sortAccessor: (r) => r.number,
      render: (r) => <span className="font-mono text-xs">{r.number}</span>,
    },
    {
      key: "start_date",
      header: "Початок",
      sortAccessor: (r) => r.start_date ?? "",
      render: (r) => <span className="text-muted-foreground">{formatDate(r.start_date)}</span>,
    },
    {
      key: "client",
      header: "Клієнт",
      sortAccessor: (r) => `${r.clients?.parent_last_name ?? ""} ${r.clients?.parent_first_name ?? ""}`.toLowerCase(),
      render: (r) => (
        <Link to="/clients/$id" params={{ id: r.client_id }} className="text-primary hover:underline">
          {r.clients?.parent_first_name} {r.clients?.parent_last_name}
        </Link>
      ),
    },
    {
      key: "child",
      header: "Дитина",
      render: (r) => (
        <span className="text-muted-foreground">
          {r.children ? `${r.children.first_name} ${r.children.last_name ?? ""}` : "—"}
        </span>
      ),
    },
    {
      key: "plan",
      header: "План / Послуга",
      render: (r) => (
        <span className="text-muted-foreground">
          {r.subscription_plans?.name ?? r.services?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "price",
      header: "Абонплата",
      align: "right",
      sortAccessor: (r) => Number(r.monthly_price),
      render: (r) => <span className="tabular-nums">{Number(r.monthly_price).toFixed(0)} ₴</span>,
    },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => r.status,
      render: (r) => (
        <StatusBadge
          tone={
            r.status === "draft"
              ? "warning"
              : r.status === "cancelled"
                ? "neutral"
                : r.status === "completed"
                  ? "info"
                  : "success"
          }
        >
          {contractStatusLabel(r.status)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Договори" description="Договори з клієнтами. Створення — з картки клієнта." />
      <SectionCard className="mb-4">
        <div className="flex items-center gap-3">
          <label className="text-xs">Статус</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Всі</SelectItem>
              <SelectItem value="draft">Чернетка</SelectItem>
              <SelectItem value="confirmed">Підтверджено</SelectItem>
              <SelectItem value="generated">Згенеровано</SelectItem>
              <SelectItem value="sent">Надіслано</SelectItem>
              <SelectItem value="signed">Підписано</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
              <SelectItem value="cancelled">Скасовано</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>
      <SectionCard>
        <DataTable
          rows={data as any[]}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "start_date", dir: "desc" }}
          emptyText="Договорів не знайдено для цієї філії."
        />
      </SectionCard>
    </PageContainer>
  );
}
