import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { Wallet, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/lib/branch-context";
import { listPayments, voidPayment } from "@/lib/finance.functions";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: PaymentsPage,
  head: () => ({ meta: [
    { title: "Платежі — Bright OS" },
    { name: "description", content: "Історія платежів клієнтів із розподілом по нарахуваннях." },
  ] }),
});

export function PaymentsPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const fn = useServerFn(listPayments);
  const voidFn = useServerFn(voidPayment);
  const [from, setFrom] = useState(() => firstOfMonth(-1));
  const [to, setTo] = useState(() => todayISO());
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["payments", branch.id, from, to, search],
    queryFn: () => fn({ data: { branch_id: branch.id, from, to, search } }),
  });

  const total = (data ?? []).filter((p: any) => p.status === "posted").reduce((s: number, p: any) => s + Number(p.amount), 0);

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id } }),
    onSuccess: () => { toast.success("Платіж скасовано"); qc.invalidateQueries({ queryKey: ["payments"] }); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Платежі"
        description="Всі отримані платежі з автоматичним FIFO розподілом на нарахування."
        actions={<div className="text-xs text-muted-foreground">Проведено: <span className="font-semibold text-emerald-600">{total.toFixed(0)} ₴</span></div>}
      />
      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className="text-xs">З</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs">По</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="md:col-span-2"><label className="text-xs">Пошук клієнта</label><Input placeholder="Ім'я або прізвище..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
      </SectionCard>

      {isLoading ? <p className="text-sm text-muted-foreground">Завантаження...</p> :
      (data ?? []).length === 0 ? (
        <EmptyState icon={Wallet} title="Платежів немає" description="Прийміть платіж на картці клієнта у вкладці «Фінанси»." />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Метод</th>
                  <th className="py-2 pr-4">Розподіл</th>
                  <th className="py-2 pr-4 text-right">Сума</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p: any) => {
                  const allocSum = (p.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount), 0);
                  const credit = Number(p.amount) - allocSum;
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{format(new Date(p.paid_at), "dd.MM.yyyy")}</td>
                      <td className="py-2 pr-4"><Link to="/clients/$id" params={{ id: p.client_id }} className="text-primary hover:underline">{p.clients?.parent_first_name} {p.clients?.parent_last_name}</Link></td>
                      <td className="py-2 pr-4 text-muted-foreground">{p.payment_methods?.name ?? "—"}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {(p.allocations ?? []).length === 0 ? <span className="text-amber-600">Кредит: {credit.toFixed(0)} ₴</span> :
                          <>
                            {(p.allocations ?? []).map((a: any) => (
                              <span key={a.id} className="mr-2">{a.charges?.period_month ? format(new Date(a.charges.period_month), "LLL yyyy") : "—"}: {Number(a.amount).toFixed(0)}</span>
                            ))}
                            {credit > 0.005 ? <span className="text-amber-600"> · кредит {credit.toFixed(0)}</span> : null}
                          </>}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium">{Number(p.amount).toFixed(0)} ₴</td>
                      <td className="py-2 pr-4"><StatusBadge tone={p.status === "void" ? "neutral" : "success"}>{p.status === "void" ? "Скасовано" : "Проведено"}</StatusBadge></td>
                      <td className="py-2 pr-4">
                        {p.status === "posted" ? (
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Скасувати цей платіж?")) voidMut.mutate(p.id); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PageContainer>
  );
}

function firstOfMonth(o: number) { const d = new Date(); d.setMonth(d.getMonth() + o, 1); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
