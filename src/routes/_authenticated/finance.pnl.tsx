import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/lib/branch-context";
import { getPnl } from "@/lib/finance.functions";

export const Route = createFileRoute("/_authenticated/finance/pnl")({
  component: PnlPage,
  head: () => ({ meta: [
    { title: "P&L — Bright OS" },
    { name: "description", content: "Операційний результат: дохід (за фактом оплати) мінус витрати." },
  ] }),
});

function PnlPage() {
  const { branch } = useBranch();
  const fn = useServerFn(getPnl);
  const [from, setFrom] = useState(() => firstOfYear());
  const [to, setTo] = useState(() => todayISO());
  const { data, isLoading } = useQuery({
    queryKey: ["pnl", branch.id, from, to],
    queryFn: () => fn({ data: { branch_id: branch.id, from, to } }),
  });

  return (
    <PageContainer>
      <PageHeader title="P&L" description="Прибутки та збитки. Дохід рахується за фактом оплати." />
      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="text-xs">З</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs">По</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </SectionCard>

      {isLoading || !data ? <p className="text-sm text-muted-foreground">Завантаження...</p> : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Tile label="Дохід" value={data.revenue_total} tone="text-emerald-600" />
            <Tile label="Витрати" value={data.expense_total} tone="text-destructive" />
            <Tile label="Операційний результат" value={data.operating_result} tone={data.operating_result >= 0 ? "text-emerald-600" : "text-destructive"} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Дохід по категоріях">
              {data.revenue_by_category.length === 0 ? <p className="text-sm text-muted-foreground">Немає даних</p> : (
                <table className="w-full text-sm"><tbody>{data.revenue_by_category.map((r) => (
                  <tr key={r.name} className="border-b last:border-0"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right font-medium">{r.amount.toFixed(0)} ₴</td></tr>
                ))}</tbody></table>
              )}
            </SectionCard>
            <SectionCard title="Витрати по категоріях">
              {data.expense_by_category.length === 0 ? <p className="text-sm text-muted-foreground">Немає даних</p> : (
                <table className="w-full text-sm"><tbody>{data.expense_by_category.map((r) => (
                  <tr key={r.name} className="border-b last:border-0"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right font-medium">{r.amount.toFixed(0)} ₴</td></tr>
                ))}</tbody></table>
              )}
            </SectionCard>
          </div>

          <SectionCard title="По місяцях" className="mt-4">
            {data.monthly.length === 0 ? <p className="text-sm text-muted-foreground">Немає операцій за період</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Місяць</th><th className="py-2 pr-4 text-right">Дохід</th><th className="py-2 pr-4 text-right">Витрати</th><th className="py-2 pr-4 text-right">Результат</th></tr></thead>
                  <tbody>{data.monthly.map((m) => (
                    <tr key={m.month} className="border-b last:border-0">
                      <td className="py-1.5 pr-4">{m.month}</td>
                      <td className="py-1.5 pr-4 text-right text-emerald-600">{m.revenue.toFixed(0)}</td>
                      <td className="py-1.5 pr-4 text-right text-destructive">{m.expense.toFixed(0)}</td>
                      <td className={`py-1.5 pr-4 text-right font-medium ${m.result >= 0 ? "text-emerald-600" : "text-destructive"}`}>{m.result.toFixed(0)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  );
}

function Tile({ label, value, tone = "text-foreground" }: any) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone}`}>{value.toFixed(0)} ₴</p></div>;
}
function firstOfYear() { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
