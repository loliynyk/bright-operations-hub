import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { CircleDollarSign, Plus, Wallet } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/lib/branch-context";
import { listClientBalances, recordPayment, getClientLedger } from "@/lib/finance.functions";
import { listLookups } from "@/lib/lookups.functions";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: PaymentsPage,
  head: () => ({
    meta: [
      { title: "Оплати — Bright OS" },
      { name: "description", content: "Клієнти з живим балансом за плаваючим вікном 3 місяці." },
    ],
  }),
});

function firstOfMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function PaymentsPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const balancesFn = useServerFn(listClientBalances);
  const lookupsFn = useServerFn(listLookups);

  const [from, setFrom] = useState(() => firstOfMonth(-1));
  const [to, setTo] = useState(() => firstOfMonth(1));
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [payFor, setPayFor] = useState<{ client_id: string; client_name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-balances", branch.id, from, to, search, group],
    queryFn: () =>
      balancesFn({
        data: {
          branch_id: branch.id || null,
          from,
          to,
          group_id: group === "all" ? null : group,
          search: search || undefined,
        },
      }),
    enabled: !!branch.id,
  });

  const { data: lookups } = useQuery({
    queryKey: ["lookups"],
    queryFn: () => lookupsFn(),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { window_charged: 0, window_paid: 0, balance: 0, credit: 0 };
  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) for (const c of r.children) if (c.group_id) m.set(c.group_id, c.group_name ?? "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  return (
    <PageContainer>
      <PageHeader
        title="Оплати"
        description="Клієнти з живим балансом. Позитивний баланс — До сплати, від'ємний — Переплата (кредит)."
        actions={
          <div className="text-xs text-muted-foreground">
            За вікно: <span className="font-semibold text-foreground">{totals.window_charged.toFixed(0)} ₴</span>
            {" · "}Оплачено: <span className="font-semibold text-emerald-600">{totals.window_paid.toFixed(0)} ₴</span>
            {" · "}Баланс: <span className={`font-semibold ${totals.balance > 0 ? "text-amber-700" : "text-emerald-600"}`}>{totals.balance.toFixed(0)} ₴</span>
          </div>
        }
      />

      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs">Вікно з</label>
            <Input type="month" value={from.slice(0, 7)} onChange={(e) => setFrom(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Вікно по</label>
            <Input type="month" value={to.slice(0, 7)} onChange={(e) => setTo(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Група</label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Пошук</label>
            <Input placeholder="Прізвище клієнта або дитини..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(-1)); setTo(firstOfMonth(1)); }}>3 місяці</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(0)); setTo(firstOfMonth(0)); }}>Цей місяць</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(-5)); setTo(firstOfMonth(0)); }}>Останні 6 міс</Button>
        </div>
      </SectionCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title="Клієнтів не знайдено" description="Змініть фільтри або період." />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 w-10">№</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Діти</th>
                  <th className="py-2 pr-4 text-right">Нараховано (вікно)</th>
                  <th className="py-2 pr-4 text-right">Оплачено (вікно)</th>
                  <th className="py-2 pr-4 text-right">Кредит</th>
                  <th className="py-2 pr-4 text-right">Баланс</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-2 text-right">Дія</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.client_id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <Link to="/clients/$id" params={{ id: r.client_id }} className="font-medium text-primary hover:underline">
                        {r.client_name}
                      </Link>
                      {r.phone ? <div className="text-xs text-muted-foreground">{r.phone}</div> : null}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {r.children.length === 0 ? "—" : r.children.map((c) => c.name).join(", ")}
                    </td>
                    <td className="py-2 pr-4 text-right">{r.window_charged.toFixed(0)} ₴</td>
                    <td className="py-2 pr-4 text-right text-emerald-700">{r.window_paid.toFixed(0)} ₴</td>
                    <td className="py-2 pr-4 text-right">{r.credit > 0 ? <span className="text-emerald-700">{r.credit.toFixed(0)} ₴</span> : "—"}</td>
                    <td className={`py-2 pr-4 text-right font-semibold ${r.balance > 0 ? "text-amber-700" : r.balance < 0 ? "text-emerald-700" : ""}`}>
                      {r.balance.toFixed(0)} ₴
                    </td>
                    <td className="py-2 pr-4">
                      <BalanceStatus balance={r.balance} days={r.max_days_overdue} />
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setPayFor({ client_id: r.client_id, client_name: r.client_name })}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Додати платіж
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {payFor ? (
        <AddPaymentModal
          clientId={payFor.client_id}
          clientName={payFor.client_name}
          branchId={branch.id}
          methods={(lookups?.paymentMethods ?? []).filter((m: any) => !m.branch_id || m.branch_id === branch.id)}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["client-balances"] });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            setPayFor(null);
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function BalanceStatus({ balance, days }: { balance: number; days: number }) {
  if (balance > 0.5) {
    return <StatusBadge tone={days > 0 ? "danger" : "warning"}>{days > 0 ? `До сплати · ${days} дн` : "До сплати"}</StatusBadge>;
  }
  if (balance < -0.5) return <StatusBadge tone="success">Переплата</StatusBadge>;
  return <StatusBadge tone="neutral">Оплачено</StatusBadge>;
}

function AddPaymentModal({
  clientId,
  clientName,
  branchId,
  methods,
  onClose,
  onSaved,
}: {
  clientId: string;
  clientName: string;
  branchId: string;
  methods: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const ledgerFn = useServerFn(getClientLedger);
  const payFn = useServerFn(recordPayment);
  const { data: ledger } = useQuery({
    queryKey: ["client-ledger", clientId],
    queryFn: () => ledgerFn({ data: { client_id: clientId } }),
  });

  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [methodId, setMethodId] = useState<string>(methods[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const outstanding = (ledger?.charges ?? [])
    .filter((c: any) => Number(c.amount) - Number(c.paid_amount ?? 0) > 0.005 && c.status !== "cancelled")
    .sort((a: any, b: any) => String(a.period_month).localeCompare(String(b.period_month)));

  const manualTotal = Object.values(manual).reduce((s, v) => s + (Number(v) || 0), 0);
  const useManual = manualTotal > 0.005;

  const mut = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Некоректна сума");
      const allocations = useManual
        ? Object.entries(manual)
            .map(([charge_id, v]) => ({ charge_id, amount: Number(v) || 0 }))
            .filter((a) => a.amount > 0)
        : undefined;
      return payFn({
        data: {
          client_id: clientId,
          branch_id: branchId,
          amount: n,
          paid_at: new Date(paidAt).toISOString(),
          payment_method_id: methodId || null,
          note: note || null,
          external_ref: ref || null,
          allocations,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Платіж додано", {
        description: res.credited > 0 ? `Кредит: ${res.credited.toFixed(0)} ₴` : `Розподілено на ${res.allocated} нарахування`,
      });
      qc.invalidateQueries({ queryKey: ["client-ledger", clientId] });
      onSaved();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Додати платіж</h3>
          <p className="text-sm text-muted-foreground">{clientName}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs">Сума (₴)</label>
            <Input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Дата</label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Метод оплати</label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть..." />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Референс / Зовнішній ID</label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="напр. bank_tx_12345" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Нотатка</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {outstanding.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium">
              Відкриті нарахування · за замовчуванням розподіл FIFO. Введіть суми для ручного розподілу.
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    <th className="py-1 pl-2 pr-2 text-left">Період</th>
                    <th className="py-1 pr-2 text-right">Сума</th>
                    <th className="py-1 pr-2 text-right">Оплачено</th>
                    <th className="py-1 pr-2 text-right">Залишок</th>
                    <th className="py-1 pr-2 text-right">Розподілити</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((c: any) => {
                    const remaining = Number(c.amount) - Number(c.paid_amount ?? 0);
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="py-1 pl-2 pr-2">{format(new Date(c.period_month), "LLL yyyy")}</td>
                        <td className="py-1 pr-2 text-right">{Number(c.amount).toFixed(0)}</td>
                        <td className="py-1 pr-2 text-right text-emerald-700">{Number(c.paid_amount ?? 0).toFixed(0)}</td>
                        <td className="py-1 pr-2 text-right text-amber-700">{remaining.toFixed(0)}</td>
                        <td className="py-1 pr-2 text-right">
                          <Input
                            className="h-7 w-24 text-right"
                            type="number"
                            min={0}
                            step={1}
                            value={manual[c.id] ?? ""}
                            onChange={(e) => setManual((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {useManual
                ? `Ручний розподіл: ${manualTotal.toFixed(0)} ₴. Залишок піде в кредит клієнта.`
                : "Порожньо — застосується FIFO (найстаріші періоди першими). Залишок автоматично стане кредитом."}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Відкритих нарахувань немає — платіж повністю запишеться як кредит.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Скасувати</Button>
          <Button
            onClick={() => {
              setBusy(true);
              mut.mutate();
            }}
            disabled={busy || !amount}
          >
            <Wallet className="mr-1 h-3.5 w-3.5" /> Провести
          </Button>
        </div>
      </div>
    </div>
  );
}
