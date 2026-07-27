import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { Receipt } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/lib/branch-context";
import { listCharges } from "@/lib/finance.functions";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/finance/charges")({
  component: ChargesPage,
  head: () => ({ meta: [
    { title: "Нарахування — Bright OS" },
    { name: "description", content: "Список щомісячних нарахувань з фільтрами по періоду та статусу." },
  ] }),
});

export function ChargesPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listCharges);
  const [from, setFrom] = useState(() => firstOfMonth(-2));
  const [to, setTo] = useState(() => firstOfMonth(1));
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["charges", branch.id, from, to, status],
    queryFn: () => fn({ data: { branch_id: branch.id, from, to, status: status === "all" ? null : status } }),
  });

  const total = (data ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
  const paid = (data ?? []).reduce((s: number, c: any) => s + Number(c.paid_amount ?? 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Нарахування"
        description="Місячні нарахування, які автоматично генеруються з підтверджених договорів."
        actions={<div className="text-xs text-muted-foreground">Всього: <span className="font-semibold text-foreground">{total.toFixed(0)} ₴</span> · Оплачено: <span className="font-semibold text-emerald-600">{paid.toFixed(0)} ₴</span></div>}
      />

      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className="text-xs">Період з</label><Input type="month" value={from.slice(0, 7)} onChange={(e) => setFrom(e.target.value + "-01")} /></div>
          <div><label className="text-xs">Період по</label><Input type="month" value={to.slice(0, 7)} onChange={(e) => setTo(e.target.value + "-01")} /></div>
          <div><label className="text-xs">Статус</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                <SelectItem value="pending">До оплати</SelectItem>
                <SelectItem value="partial">Частково</SelectItem>
                <SelectItem value="paid">Оплачено</SelectItem>
                <SelectItem value="overdue">Прострочено</SelectItem>
                <SelectItem value="cancelled">Скасовано</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={Receipt} title="Нарахувань не знайдено" description="Змініть фільтри або підтвердіть договір, щоб згенерувати нарахування." />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Період</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Дитина</th>
                  <th className="py-2 pr-4">Термін</th>
                  <th className="py-2 pr-4 text-right">Сума</th>
                  <th className="py-2 pr-4 text-right">Оплачено</th>
                  <th className="py-2 pr-4">Статус</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{format(new Date(c.period_month), "LLL yyyy")}{c.is_prorated ? <span className="ml-1 text-xs text-amber-600">•пр</span> : null}</td>
                    <td className="py-2 pr-4"><Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">{c.clients?.parent_first_name} {c.clients?.parent_last_name}</Link></td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.contracts?.children ? `${c.contracts.children.first_name} ${c.contracts.children.last_name ?? ""}` : "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{c.due_date ?? "—"}</td>
                    <td className="py-2 pr-4 text-right">{Number(c.amount).toFixed(0)} ₴</td>
                    <td className="py-2 pr-4 text-right">{Number(c.paid_amount ?? 0).toFixed(0)} ₴</td>
                    <td className="py-2 pr-4"><ChargeStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PageContainer>
  );
}

function ChargeStatus({ status }: { status: string }) {
  const m: Record<string, { tone: any; label: string }> = {
    pending: { tone: "warning", label: "До оплати" },
    partial: { tone: "info", label: "Частково" },
    paid: { tone: "success", label: "Оплачено" },
    overdue: { tone: "danger", label: "Прострочено" },
    cancelled: { tone: "neutral", label: "Скасовано" },
  };
  const s = m[status] ?? { tone: "neutral" as const, label: status };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

function firstOfMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
