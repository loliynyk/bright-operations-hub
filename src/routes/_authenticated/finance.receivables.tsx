import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/ds";
import { AlertCircle } from "lucide-react";
import { useBranch } from "@/lib/branch-context";
import { listReceivables } from "@/lib/finance.functions";

export const Route = createFileRoute("/_authenticated/finance/receivables")({
  component: ReceivablesPage,
  head: () => ({ meta: [
    { title: "Дебіторка — Bright OS" },
    { name: "description", content: "Заборгованість клієнтів з розподілом по періодам старіння." },
  ] }),
});

function ReceivablesPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listReceivables);
  const { data, isLoading } = useQuery({
    queryKey: ["receivables", branch.id],
    queryFn: () => fn({ data: { branch_id: branch.id } }),
  });

  const totals = (data ?? []).reduce((acc: any, r: any) => {
    acc.total += r.total; acc.current += r.current; acc.b1_30 += r.b1_30; acc.b31_60 += r.b31_60; acc.b61_plus += r.b61_plus;
    return acc;
  }, { total: 0, current: 0, b1_30: 0, b31_60: 0, b61_plus: 0 });

  return (
    <PageContainer>
      <PageHeader title="Дебіторка" description="Хто винен, скільки і як довго." />
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Tile label="Всього боргу" value={totals.total} tone="text-destructive" />
        <Tile label="Поточне" value={totals.current} />
        <Tile label="1–30 днів" value={totals.b1_30} tone="text-amber-600" />
        <Tile label="31–60 днів" value={totals.b31_60} tone="text-orange-600" />
        <Tile label="60+ днів" value={totals.b61_plus} tone="text-destructive" />
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Завантаження...</p> :
      (data ?? []).length === 0 ? (
        <EmptyState icon={AlertCircle} title="Немає боргів" description="Всі клієнти оплатили вчасно." />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Дитина</th>
                  <th className="py-2 pr-4">Група</th>
                  <th className="py-2 pr-4 text-right">Поточне</th>
                  <th className="py-2 pr-4 text-right">1–30</th>
                  <th className="py-2 pr-4 text-right">31–60</th>
                  <th className="py-2 pr-4 text-right">60+</th>
                  <th className="py-2 pr-4 text-right">Всього</th>
                  <th className="py-2 pr-4 text-right">Місяців</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r: any) => (
                  <tr key={r.client_id} className="border-b last:border-0">
                    <td className="py-2 pr-4"><Link to="/clients/$id" params={{ id: r.client_id }} className="text-primary hover:underline font-medium">{r.client_name}</Link></td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.child_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.group_name}</td>
                    <td className="py-2 pr-4 text-right">{fmt(r.current)}</td>
                    <td className="py-2 pr-4 text-right text-amber-600">{fmt(r.b1_30)}</td>
                    <td className="py-2 pr-4 text-right text-orange-600">{fmt(r.b31_60)}</td>
                    <td className="py-2 pr-4 text-right text-destructive font-medium">{fmt(r.b61_plus)}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{fmt(r.total)}</td>
                    <td className="py-2 pr-4 text-right text-xs">{r.months_overdue > 0 ? r.months_overdue : "—"}</td>
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

function Tile({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{fmt(value)}</p>
    </div>
  );
}
function fmt(n: number) { return n > 0 ? `${n.toFixed(0)} ₴` : "—"; }
