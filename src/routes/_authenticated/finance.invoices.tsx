import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Receipt, RefreshCw, Wallet } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranch } from "@/lib/branch-context";
import { listInvoices, applyContractPriceChange } from "@/lib/finance.functions";
import { extendChargesNextQuarter, recalcContractCharges } from "@/lib/admissions.functions";

export const Route = createFileRoute("/_authenticated/finance/invoices")({
  component: InvoicesPage,
  head: () => ({
    meta: [
      { title: "Нарахування — Bright OS" },
      { name: "description", content: "Центр контролю нарахувань: розбивка, статуси, зміна цін та розширення горизонту." },
    ],
  }),
});

function firstOfMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function InvoicesPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const fn = useServerFn(listInvoices);
  const extendFn = useServerFn(extendChargesNextQuarter);
  const recalcFn = useServerFn(recalcContractCharges);
  const priceFn = useServerFn(applyContractPriceChange);

  const [from, setFrom] = useState(() => firstOfMonth(-2));
  const [to, setTo] = useState(() => firstOfMonth(2));
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [priceModal, setPriceModal] = useState<{ contract_id: string; client_name: string; current: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", branch.id, from, to, status, search],
    queryFn: () =>
      fn({
        data: {
          branch_id: branch.id || null,
          from,
          to,
          status: status === "all" ? null : status,
          search: search || undefined,
        },
      }),
    enabled: !!branch.id,
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { charged: 0, paid: 0, remaining: 0 };

  const extendMut = useMutation({
    mutationFn: () => extendFn({ data: { branch_id: branch.id || null } }),
    onSuccess: (res) => {
      toast.success("Горизонт розширено", { description: `Оброблено договорів: ${res.contracts}` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const recalcMut = useMutation({
    mutationFn: (contractId: string) => recalcFn({ data: { contractId } }),
    onSuccess: (res: any) => {
      toast.success("Нарахування оновлено", {
        description: `Створено: ${res.created}, оновлено: ${res.updated}, скасовано: ${res.cancelled}`,
      });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uniqueContracts = useMemo(() => {
    const m = new Map<string, { contract_id: string; client_name: string; current: number }>();
    for (const r of rows) {
      if (!m.has(r.contract_id)) {
        m.set(r.contract_id, {
          contract_id: r.contract_id,
          client_name: r.client_name,
          current: r.breakdown.base_price,
        });
      }
    }
    return Array.from(m.values());
  }, [rows]);

  return (
    <PageContainer>
      <PageHeader
        title="Нарахування"
        description="Центр контролю: базова ціна, знижка, робочі дні, ручні коригування. Прорейтинг рахується по робочих днях (Пн–Пт)."
        actions={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div>
              Всього: <span className="font-semibold text-foreground">{totals.charged.toFixed(0)} ₴</span>
              {" · "}Оплачено: <span className="font-semibold text-emerald-600">{totals.paid.toFixed(0)} ₴</span>
              {" · "}Залишок: <span className="font-semibold text-amber-600">{totals.remaining.toFixed(0)} ₴</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => extendMut.mutate()} disabled={extendMut.isPending}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Розширити горизонт
            </Button>
          </div>
        }
      />

      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs">Період з</label>
            <Input type="month" value={from.slice(0, 7)} onChange={(e) => setFrom(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Період по</label>
            <Input type="month" value={to.slice(0, 7)} onChange={(e) => setTo(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Статус</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                <SelectItem value="pending">До оплати</SelectItem>
                <SelectItem value="partial">Частково</SelectItem>
                <SelectItem value="paid">Оплачено</SelectItem>
                <SelectItem value="overdue">Прострочено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Пошук клієнта або дитини</label>
            <Input placeholder="Прізвище, ім'я..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {uniqueContracts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="mt-1">Зміна ціни:</span>
            {uniqueContracts.slice(0, 8).map((c) => (
              <Button
                key={c.contract_id}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setPriceModal(c)}
              >
                {c.client_name} · {c.current.toFixed(0)} ₴
              </Button>
            ))}
          </div>
        ) : null}
      </SectionCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Нарахувань не знайдено"
          description="Змініть фільтри або підтвердіть договір, щоб згенерувати нарахування."
        />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-2 pr-2 w-8"></th>
                  <th className="py-2 pr-4">Період</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Дитина</th>
                  <th className="py-2 pr-4">Група</th>
                  <th className="py-2 pr-4 text-right">Сума</th>
                  <th className="py-2 pr-4 text-right">Оплачено</th>
                  <th className="py-2 pr-4 text-right">Залишок</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded.has(r.id);
                  return (
                    <>
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 pl-2 pr-2">
                          <button onClick={() => toggle(r.id)} className="text-muted-foreground hover:text-foreground">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="py-2 pr-4 font-medium">
                          {format(new Date(r.period_month), "LLL yyyy")}
                          {r.is_prorated ? <span className="ml-1 text-xs text-amber-600">•пр</span> : null}
                        </td>
                        <td className="py-2 pr-4">
                          <Link to="/clients/$id" params={{ id: r.client_id }} className="text-primary hover:underline">
                            {r.client_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.child_name || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.group_name ?? "—"}</td>
                        <td className="py-2 pr-4 text-right">{r.amount.toFixed(0)} ₴</td>
                        <td className="py-2 pr-4 text-right text-emerald-700">{r.paid_amount.toFixed(0)} ₴</td>
                        <td className="py-2 pr-4 text-right font-medium">
                          {r.remaining > 0 ? <span className="text-amber-700">{r.remaining.toFixed(0)} ₴</span> : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <InvoiceStatus status={r.status} />
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => recalcMut.mutate(r.contract_id)}
                            title="Перегенерувати нарахування договору"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${r.id}-b`} className="border-b bg-muted/20 text-xs">
                          <td></td>
                          <td colSpan={9} className="py-3 pr-4">
                            <div className="grid gap-2 md:grid-cols-5">
                              <BreakdownRow label="Базова ціна" value={`${r.breakdown.base_price.toFixed(0)} ₴`} />
                              <BreakdownRow
                                label="Знижка"
                                value={
                                  r.breakdown.discount_amount > 0
                                    ? `-${r.breakdown.discount_amount.toFixed(0)} ₴${r.breakdown.discount_label ? ` (${r.breakdown.discount_label})` : ""}`
                                    : "—"
                                }
                              />
                              <BreakdownRow
                                label="Ручна знижка"
                                value={r.breakdown.manual_discount > 0 ? `-${r.breakdown.manual_discount.toFixed(0)} ₴` : "—"}
                              />
                              <BreakdownRow
                                label="Прорейтинг (Пн–Пт)"
                                value={
                                  r.breakdown.total_wd > 0
                                    ? `${r.breakdown.active_wd}/${r.breakdown.total_wd} р.д. → ${r.breakdown.expected_amount.toFixed(0)} ₴`
                                    : `${r.breakdown.expected_amount.toFixed(0)} ₴`
                                }
                              />
                              <BreakdownRow
                                label="Ручне коригування"
                                value={
                                  Math.abs(r.breakdown.manual_adjustment) > 0.005
                                    ? `${r.breakdown.manual_adjustment > 0 ? "+" : ""}${r.breakdown.manual_adjustment.toFixed(0)} ₴`
                                    : "—"
                                }
                              />
                            </div>
                            {r.due_date ? (
                              <div className="mt-2 text-muted-foreground">Термін: {r.due_date}</div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {priceModal ? (
        <PriceChangeModal
          contractId={priceModal.contract_id}
          clientName={priceModal.client_name}
          currentPrice={priceModal.current}
          onClose={() => setPriceModal(null)}
          onSubmit={async (newPrice, effectiveMonth) => {
            try {
              const res = await priceFn({
                data: { contract_id: priceModal.contract_id, new_monthly_price: newPrice, effective_month: effectiveMonth },
              });
              toast.success("Ціну застосовано", { description: `Оновлено нарахувань: ${res.updated}` });
              qc.invalidateQueries({ queryKey: ["invoices"] });
              setPriceModal(null);
            } catch (e: any) {
              toast.error("Помилка", { description: e.message });
            }
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

function InvoiceStatus({ status }: { status: string }) {
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

function PriceChangeModal({
  contractId,
  clientName,
  currentPrice,
  onClose,
  onSubmit,
}: {
  contractId: string;
  clientName: string;
  currentPrice: number;
  onClose: () => void;
  onSubmit: (newPrice: number, effectiveMonth: string) => Promise<void>;
}) {
  const [price, setPrice] = useState(currentPrice.toString());
  const [month, setMonth] = useState(() => firstOfMonth(1).slice(0, 7));
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Зміна ціни</h3>
          <p className="text-sm text-muted-foreground">
            {clientName} · договір {contractId.slice(0, 8)}
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs">Нова місячна ціна (₴)</label>
            <Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Діє з початку місяця</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Оновляться тільки майбутні неоплачені нарахування з {month}. Оплачені й часткові залишаться без змін.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Скасувати</Button>
          <Button
            onClick={async () => {
              const n = Number(price);
              if (!Number.isFinite(n) || n <= 0) return;
              setBusy(true);
              await onSubmit(n, month + "-01");
              setBusy(false);
            }}
            disabled={busy}
          >
            <Wallet className="mr-1 h-3.5 w-3.5" /> Застосувати
          </Button>
        </div>
      </div>
    </div>
  );
}
