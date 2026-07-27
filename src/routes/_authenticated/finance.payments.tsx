import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageContainer, PageHeader, SectionCard, StatusBadge } from "@/components/ds";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/lib/branch-context";
import { listPayments, voidPayment } from "@/lib/finance.functions";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: PaymentsPage,
  head: () => ({
    meta: [
      { title: "Платежі — Bright OS" },
      { name: "description", content: "Історія платежів клієнтів із розподілом по нарахуваннях." },
    ],
  }),
});

export function PaymentsPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const fn = useServerFn(listPayments);
  const voidFn = useServerFn(voidPayment);
  const [from, setFrom] = useState(() => monthsAgoISO(12));
  const [to, setTo] = useState(() => todayISO());

  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["payments", branch.id, from, to, search],
    queryFn: () => fn({ data: { branch_id: branch.id || null, from, to, search } }),
    enabled: !!branch.id,
  });

  const rows = (data ?? []) as any[];
  const total = rows.filter((p) => p.status === "posted").reduce((s, p) => s + Number(p.amount), 0);

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Платіж скасовано");
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "paid_at",
      header: "Дата",
      sortAccessor: (r) => r.paid_at,
      render: (r) => formatDate(r.paid_at),
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
      key: "method",
      header: "Метод",
      render: (r) => <span className="text-muted-foreground">{r.payment_methods?.name ?? "—"}</span>,
    },
    {
      key: "alloc",
      header: "Розподіл",
      render: (r) => {
        const allocSum = (r.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount), 0);
        const credit = Number(r.amount) - allocSum;
        return (r.allocations ?? []).length === 0 ? (
          <span className="text-xs text-amber-600">Кредит: {credit.toFixed(0)} ₴</span>
        ) : (
          <div className="text-xs text-muted-foreground">
            {(r.allocations ?? []).map((a: any) => (
              <span key={a.id} className="mr-2">
                {a.charges?.period_month ? format(new Date(a.charges.period_month), "LLL yyyy") : "—"}:{" "}
                {Number(a.amount).toFixed(0)}
              </span>
            ))}
            {credit > 0.005 ? <span className="text-amber-600"> · кредит {credit.toFixed(0)}</span> : null}
          </div>
        );
      },
    },
    {
      key: "amount",
      header: "Сума",
      align: "right",
      sortAccessor: (r) => Number(r.amount),
      render: (r) => <span className="font-medium">{Number(r.amount).toFixed(0)} ₴</span>,
    },
    {
      key: "status",
      header: "Статус",
      sortAccessor: (r) => r.status,
      render: (r) => (
        <StatusBadge tone={r.status === "void" ? "neutral" : "success"}>
          {r.status === "void" ? "Скасовано" : "Проведено"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "posted" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Скасувати цей платіж?")) voidMut.mutate(r.id);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Платежі"
        description="Всі отримані платежі з автоматичним FIFO розподілом на нарахування."
        actions={
          <div className="text-xs text-muted-foreground">
            Проведено: <span className="font-semibold text-emerald-600">{total.toFixed(0)} ₴</span>
          </div>
        }
      />
      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs">З</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">По</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Пошук клієнта</label>
            <Input placeholder="Ім'я або прізвище..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => { setFrom("2020-01-01"); setTo(todayISO()); }}>Увесь період</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(monthsAgoISO(12)); setTo(todayISO()); }}>Останні 12 міс</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(0)); setTo(todayISO()); }}>Цей місяць</Button>
        </div>
      </SectionCard>


      <SectionCard>
        <DataTable
          rows={rows}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "paid_at", dir: "desc" }}
          emptyText="Платежів не знайдено за цей період."
        />
      </SectionCard>
    </PageContainer>
  );
}

function firstOfMonth(o: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + o, 1);
  return d.toISOString().slice(0, 10);
}
function monthsAgoISO(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n, 1);
  return d.toISOString().slice(0, 10);
}


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
