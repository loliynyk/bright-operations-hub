import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard, SearchInput, StatusBadge } from "@/components/ds";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { useBranch } from "@/lib/branch-context";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndex,
});

const CLIENT_STATUS_LABEL: Record<string, string> = {
  active: "Активний",
  paused: "Призупинений",
  archived: "Архів",
};

function ClientsIndex() {
  const { branch } = useBranch();
  const listFn = useServerFn(listClients);
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });
  const [q, setQ] = useState("");
  const filtered = (clients as any[]).filter((c) => {
    if (!q) return true;
    return `${c.parent_first_name} ${c.parent_last_name} ${c.phone ?? ""} ${c.email ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase());
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
      render: (r) => (
        <Link to="/clients/$id" params={{ id: r.id }} className="font-medium text-foreground hover:underline">
          {r.parent_first_name} {r.parent_last_name}
        </Link>
      ),
    },
    { key: "phone", header: "Телефон", render: (r) => <span className="text-muted-foreground">{r.phone ?? "—"}</span> },
    { key: "email", header: "Email", render: (r) => <span className="text-muted-foreground">{r.email ?? "—"}</span> },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => r.status ?? "",
      render: (r) => (
        <StatusBadge tone={r.status === "active" ? "success" : r.status === "paused" ? "warning" : "neutral"}>
          {CLIENT_STATUS_LABEL[r.status] ?? r.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Клієнти" description="Батьки, з якими укладено співпрацю." />
      <SectionCard>
        <div className="mb-4">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "start_date", dir: "desc" }}
          emptyText="Клієнтів не знайдено."
        />
      </SectionCard>
    </PageContainer>
  );
}
