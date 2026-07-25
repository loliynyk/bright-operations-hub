import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/lib/branch-context";
import { getCashFlow } from "@/lib/finance.functions";

export const Route = createFileRoute("/_authenticated/finance/cash-flow")({
  component: CashFlowPage,
  head: () => ({ meta: [
    { title: "Cash Flow — Bright OS" },
    { name: "description", content: "Фактичний рух грошей: платежі мінус витрати." },
  ] }),
});

function CashFlowPage() {
  const { branch } = useBranch();
  const fn = useServerFn(getCashFlow);
  const [from, setFrom] = useState(() => firstOfMonth(0));
  const [to, setTo] = useState(() => todayISO());
  const { data, isLoading } = useQuery({
    queryKey: ["cash-flow", branch.id, from, to],
    queryFn: () => fn({ data: { branch_id: branch.id, from, to } }),
  });

  return (
    <PageContainer>
      <PageHeader title="Cash Flow" description="Фактичний рух коштів. Показує тільки те, що реально прийшло та вийшло." />
      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="text-xs">З</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs">По</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </SectionCard>

      {isLoading || !data ? <p className="text-sm text-muted-foreground">Завантаження...</p> : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Tile label="Залишок на початок" value={data.opening} />
            <Tile label="Надходження" value={data.inflow} tone="text-emerald-600" />
            <Tile label="Витрати" value={data.outflow} tone="text-destructive" />
            <Tile label="Залишок на кінець" value={data.closing} tone={data.closing >= 0 ? "text-emerald-600" : "text-destructive"} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="По методах оплати">
              {data.by_method.length === 0 ? <p className="text-sm text-muted-foreground">Немає даних</p> : (
                <table className="w-full text-sm">
                  <tbody>{data.by_method.map((r) => (
                    <tr key={r.name} className="border-b last:border-0"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right font-medium">{r.amount.toFixed(0)} ₴</td></tr>
                  ))}</tbody>
                </table>
              )}
            </SectionCard>
            <SectionCard title="По категоріях витрат">
              {data.by_category.length === 0 ? <p className="text-sm text-muted-foreground">Немає даних</p> : (
                <table className="w-full text-sm">
                  <tbody>{data.by_category.map((r) => (
                    <tr key={r.name} className="border-b last:border-0"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right font-medium">{r.amount.toFixed(0)} ₴</td></tr>
                  ))}</tbody>
                </table>
              )}
            </SectionCard>
          </div>

          <SectionCard title="По днях" className="mt-4">
            {data.days.length === 0 ? <p className="text-sm text-muted-foreground">Немає операцій за період</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">День</th><th className="py-2 pr-4 text-right">Надходження</th><th className="py-2 pr-4 text-right">Витрати</th><th className="py-2 pr-4 text-right">Нетто</th></tr></thead>
                  <tbody>{data.days.map((d) => (
                    <tr key={d.day} className="border-b last:border-0">
                      <td className="py-1.5 pr-4">{d.day}</td>
                      <td className="py-1.5 pr-4 text-right text-emerald-600">{d.in.toFixed(0)}</td>
                      <td className="py-1.5 pr-4 text-right text-destructive">{d.out.toFixed(0)}</td>
                      <td className={`py-1.5 pr-4 text-right font-medium ${d.in - d.out >= 0 ? "text-emerald-600" : "text-destructive"}`}>{(d.in - d.out).toFixed(0)}</td>
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
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${tone}`}>{value.toFixed(0)} ₴</p></div>;
}
function firstOfMonth(o: number) { const d = new Date(); d.setMonth(d.getMonth() + o, 1); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
