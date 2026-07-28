import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { z } from "zod";
import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Plus,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBranch } from "@/lib/branch-context";
import {
  listInvoices,
  applyContractPriceChange,
  listClientBalances,
  recordPayment,
  getClientLedger,
  adjustCharge,
  cancelCharge,
} from "@/lib/finance.functions";
import { extendChargesNextQuarter, recalcContractCharges } from "@/lib/admissions.functions";
import { listLookups } from "@/lib/lookups.functions";

const searchSchema = z.object({
  tab: z.enum(["invoices", "payments"]).optional(),
});

export const Route = createFileRoute("/_authenticated/finance/settlements")({
  validateSearch: searchSchema,
  component: SettlementsPage,
  head: () => ({
    meta: [
      { title: "Розрахунки — Bright OS" },
      { name: "description", content: "Єдина фінансова панель: нарахування та оплати клієнтів." },
    ],
  }),
});

// helpers ----------------------------------------------------------
function firstOfMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthLabel(iso: string) {
  return format(new Date(iso), "LLL yyyy");
}

function SettlementsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab = search.tab ?? "invoices";

  return (
    <PageContainer>
      <PageHeader
        title="Розрахунки"
        description="Єдина панель фінансів: нарахування та оплати клієнтів."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as "invoices" | "payments" } })}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="invoices">Нарахування</TabsTrigger>
          <TabsTrigger value="payments">Оплати</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-0">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-0">
          <PaymentsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ============================================================
// KPI grid
// ============================================================
function KpiGrid({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((k) => (
        <SectionCard key={k.label} className="!p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
          <div className={`mt-1 text-lg font-semibold ${k.tone ?? "text-foreground"}`}>{k.value}</div>
        </SectionCard>
      ))}
    </div>
  );
}

// ============================================================
// НАРАХУВАННЯ TAB
// ============================================================
function InvoicesTab() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const fn = useServerFn(listInvoices);
  const extendFn = useServerFn(extendChargesNextQuarter);
  const recalcFn = useServerFn(recalcContractCharges);
  const priceFn = useServerFn(applyContractPriceChange);
  const adjustFn = useServerFn(adjustCharge);
  const cancelFn = useServerFn(cancelCharge);
  const lookupsFn = useServerFn(listLookups);

  // Default: current, previous, two months ago → from=-2, to=0
  const [from, setFrom] = useState(() => firstOfMonth(-2));
  const [to, setTo] = useState(() => firstOfMonth(0));
  const [status, setStatus] = useState<string>("all");
  const [group, setGroup] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<null | { id: string; current: number; period: string; client: string }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", branch.id, from, to, status, group, search],
    queryFn: () =>
      fn({
        data: {
          branch_id: branch.id || null,
          from,
          to,
          status: status === "all" ? null : status,
          group_id: group === "all" ? null : group,
          search: search || undefined,
        },
      }),
    enabled: !!branch.id,
  });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { charged: 0, paid: 0, remaining: 0 };

  const counts = useMemo(() => {
    const c = { pending: 0, partial: 0, paid: 0, overdue: 0 };
    for (const r of rows) if (r.status in c) (c as any)[r.status] += 1;
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const branchGroups = (lookups?.groups ?? []).filter((g: any) => !branch.id || !g.branch_id || g.branch_id === branch.id);
    return branchGroups.map((g: any) => ({ id: g.id as string, name: g.name as string }));
  }, [lookups, branch.id]);

  const extendMut = useMutation({
    mutationFn: () => extendFn({ data: { branch_id: branch.id || null } }),
    onSuccess: (res: any) => {
      toast.success("Нарахування створено", { description: `Оброблено договорів: ${res.contracts}` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["client-balances"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const recalcMut = useMutation({
    mutationFn: (id: string) => recalcFn({ data: { contractId: id } }),
    onSuccess: (res: any) => {
      toast.success("Оновлено", { description: `Створено ${res.created}, оновлено ${res.updated}, скасовано ${res.cancelled}` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Нарахування скасовано");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const money = (n: number) => `${n.toFixed(0)} ₴`;

  return (
    <>
      <KpiGrid
        items={[
          { label: "Нараховано", value: money(totals.charged) },
          { label: "Кількість нарахувань", value: String(rows.length) },
          { label: "До оплати", value: String(counts.pending + counts.overdue), tone: "text-amber-700" },
          { label: "Частково", value: String(counts.partial), tone: "text-blue-700" },
          { label: "Оплачено", value: String(counts.paid), tone: "text-emerald-700" },
        ]}
      />

      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-6">
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                <SelectItem value="pending">До оплати</SelectItem>
                <SelectItem value="partial">Частково</SelectItem>
                <SelectItem value="paid">Оплачено</SelectItem>
                <SelectItem value="overdue">Прострочено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Група</label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Пошук клієнта або дитини</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Прізвище, ім'я..." />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => extendMut.mutate()} disabled={extendMut.isPending}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Сформувати нарахування на 3 місяці
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Wallet className="mr-1 h-3.5 w-3.5" /> Змінити базову ціну
          </Button>
        </div>
      </SectionCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Нарахувань не знайдено" description="Змініть фільтри або сформуйте нарахування." />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-2 pr-2 w-8"></th>
                  <th className="py-2 pr-2 w-10">№</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Дитина</th>
                  <th className="py-2 pr-4">Група</th>
                  <th className="py-2 pr-4">Місяць</th>
                  <th className="py-2 pr-4 text-right">Базова</th>
                  <th className="py-2 pr-4 text-right">Знижка</th>
                  <th className="py-2 pr-4 text-right">Пропорц.</th>
                  <th className="py-2 pr-4 text-right">Ручне</th>
                  <th className="py-2 pr-4 text-right">Разом</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const open = expanded.has(r.id);
                  const b = r.breakdown;
                  const prorateAdj = b.total_wd > 0 ? Math.round((b.expected_amount - (b.effective_monthly - b.manual_discount)) * 100) / 100 : 0;
                  return (
                    <>
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 pl-2 pr-2">
                          <button onClick={() => toggle(r.id)} className="text-muted-foreground hover:text-foreground">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-4">
                          <Link to="/clients/$id" params={{ id: r.client_id }} className="text-primary hover:underline">
                            {r.client_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.child_name || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{r.group_name ?? "—"}</td>
                        <td className="py-2 pr-4 font-medium">
                          {monthLabel(r.period_month)}
                          {r.is_prorated ? <span className="ml-1 text-xs text-amber-600">•пр</span> : null}
                        </td>
                        <td className="py-2 pr-4 text-right">{money(b.base_price)}</td>
                        <td className="py-2 pr-4 text-right">{b.discount_amount + b.manual_discount > 0 ? `-${money(b.discount_amount + b.manual_discount)}` : "—"}</td>
                        <td className="py-2 pr-4 text-right">{prorateAdj !== 0 ? money(prorateAdj) : "—"}</td>
                        <td className="py-2 pr-4 text-right">{Math.abs(b.manual_adjustment) > 0.005 ? `${b.manual_adjustment > 0 ? "+" : ""}${money(b.manual_adjustment)}` : "—"}</td>
                        <td className="py-2 pr-4 text-right font-semibold">{money(r.amount)}</td>
                        <td className="py-2 pr-4"><InvoiceStatus status={r.status} /></td>
                        <td className="py-2 pr-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Ручне коригування" onClick={() => setAdjustFor({ id: r.id, current: r.amount, period: r.period_month, client: r.client_name })}>
                              <Wallet className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Перегенерувати договір" onClick={() => recalcMut.mutate(r.contract_id)}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${r.id}-b`} className="border-b bg-muted/20 text-xs">
                          <td></td>
                          <td colSpan={12} className="py-3 pr-4">
                            <div className="grid gap-3 md:grid-cols-6">
                              <Detail label="Базова ціна" value={money(b.base_price)} />
                              <Detail label="Знижка" value={b.discount_amount > 0 ? `-${money(b.discount_amount)}${b.discount_label ? ` (${b.discount_label})` : ""}` : "—"} />
                              <Detail label="Ручна знижка" value={b.manual_discount > 0 ? `-${money(b.manual_discount)}` : "—"} />
                              <Detail label="Ефективна" value={money(b.effective_monthly)} />
                              <Detail
                                label="Робочі дні (Пн–Пт)"
                                value={b.total_wd > 0 ? `${b.active_wd}/${b.total_wd} → ${money(b.expected_amount)}` : money(b.expected_amount)}
                              />
                              <Detail label="Ручне коригування" value={Math.abs(b.manual_adjustment) > 0.005 ? `${b.manual_adjustment > 0 ? "+" : ""}${money(b.manual_adjustment)}` : "—"} />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-muted-foreground">
                              <span>{r.due_date ? `Термін: ${r.due_date}` : ""}</span>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => {
                                if (confirm(`Скасувати нарахування за ${monthLabel(r.period_month)}?`)) cancelMut.mutate(r.id);
                              }}>Скасувати нарахування</Button>
                            </div>
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

      {bulkOpen ? (
        <BulkPriceChangeModal
          contracts={Array.from(new Map(rows.map((r) => [r.contract_id, {
            contract_id: r.contract_id,
            client_name: r.client_name,
            group_id: (r as any).contracts?.children?.group_id ?? null,
            group_name: r.group_name,
            current: r.breakdown.base_price,
          }])).values())}
          onClose={() => setBulkOpen(false)}
          onApply={async (targetIds, newPrice, effectiveMonth) => {
            let ok = 0, fail = 0;
            for (const id of targetIds) {
              try {
                await priceFn({ data: { contract_id: id, new_monthly_price: newPrice, effective_month: effectiveMonth } });
                ok += 1;
              } catch { fail += 1; }
            }
            toast.success("Ціну оновлено", { description: `Договорів: ${ok}${fail ? `, помилок: ${fail}` : ""}` });
            qc.invalidateQueries({ queryKey: ["invoices"] });
            qc.invalidateQueries({ queryKey: ["client-balances"] });
            setBulkOpen(false);
          }}
        />
      ) : null}

      {adjustFor ? (
        <AdjustChargeModal
          info={adjustFor}
          onClose={() => setAdjustFor(null)}
          onSave={async (newAmount, reason) => {
            try {
              await adjustFn({ data: { chargeId: adjustFor.id, newAmount, reason } });
              toast.success("Нарахування скориговано");
              qc.invalidateQueries({ queryKey: ["invoices"] });
              setAdjustFor(null);
            } catch (e: any) {
              toast.error("Помилка", { description: e.message });
            }
          }}
        />
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
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

function AdjustChargeModal({
  info, onClose, onSave,
}: {
  info: { id: string; current: number; period: string; client: string };
  onClose: () => void;
  onSave: (newAmount: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(info.current));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Ручне коригування</h3>
        <p className="text-sm text-muted-foreground">{info.client} · {monthLabel(info.period)}</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs">Нова сума (₴)</label>
            <Input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Причина</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="напр. компенсація за пропуск" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Скасувати</Button>
          <Button onClick={async () => {
            const n = Number(amount);
            if (!Number.isFinite(n) || n < 0 || !reason.trim()) return;
            setBusy(true);
            await onSave(n, reason.trim());
            setBusy(false);
          }} disabled={busy}>Зберегти</Button>
        </div>
      </div>
    </div>
  );
}

function BulkPriceChangeModal({
  contracts, onClose, onApply,
}: {
  contracts: { contract_id: string; client_name: string; group_id: string | null; group_name: string | null; current: number }[];
  onClose: () => void;
  onApply: (ids: string[], newPrice: number, effectiveMonth: string) => Promise<void>;
}) {
  const [price, setPrice] = useState("");
  const [month, setMonth] = useState(() => firstOfMonth(1).slice(0, 7));
  const [scope, setScope] = useState<"all" | "group">("all");
  const [groupId, setGroupId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contracts) if (c.group_id) m.set(c.group_id, c.group_name ?? "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [contracts]);

  const targetIds = useMemo(() => {
    if (scope === "group" && groupId) return contracts.filter((c) => c.group_id === groupId).map((c) => c.contract_id);
    return contracts.map((c) => c.contract_id);
  }, [scope, groupId, contracts]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Змінити базову ціну</h3>
        <p className="text-sm text-muted-foreground">
          Оновляться майбутні неоплачені нарахування з обраного місяця. Оплачені та часткові — без змін.
        </p>
        <div className="mt-3 grid gap-3">
          <div>
            <label className="text-xs">Область застосування</label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Усі договори у поточному фільтрі ({contracts.length})</SelectItem>
                <SelectItem value="group">Тільки обрана група</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "group" ? (
            <div>
              <label className="text-xs">Група</label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs">Нова місячна ціна (₴)</label>
              <Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className="text-xs">Діє з початку місяця</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Буде оновлено договорів: <span className="font-medium text-foreground">{targetIds.length}</span>
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Скасувати</Button>
          <Button
            disabled={busy || !price || targetIds.length === 0}
            onClick={async () => {
              const n = Number(price);
              if (!Number.isFinite(n) || n <= 0) return;
              setBusy(true);
              await onApply(targetIds, n, month + "-01");
              setBusy(false);
            }}
          >
            <Wallet className="mr-1 h-3.5 w-3.5" /> Застосувати
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ОПЛАТИ TAB
// ============================================================
function PaymentsTab() {
  const { branch } = useBranch();
  const balancesFn = useServerFn(listClientBalances);
  const lookupsFn = useServerFn(listLookups);

  // Default window = current + previous two months (from = -2, to = 0)
  const [from, setFrom] = useState(() => firstOfMonth(-2));
  const [to, setTo] = useState(() => firstOfMonth(0));
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState<Set<string>>(new Set());
  const [payFor, setPayFor] = useState<null | {
    client_id: string;
    client_name: string;
    charge_id: string;
    period_month: string;
    remaining: number;
  }>(null);

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
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  const rowsRaw = data?.rows ?? [];
  const rows = useMemo(() => {
    if (statusFilter === "all") return rowsRaw;
    return rowsRaw.filter((r) => {
      if (statusFilter === "debt") return r.balance > 0.5;
      if (statusFilter === "credit") return r.balance < -0.5;
      if (statusFilter === "paid") return Math.abs(r.balance) <= 0.5;
      return true;
    });
  }, [rowsRaw, statusFilter]);

  const totals = data?.totals ?? { window_charged: 0, window_paid: 0, balance: 0, credit: 0 };
  const partialCount = useMemo(() => rowsRaw.filter((r) => r.balance > 0.5 && r.total_paid > 0).length, [rowsRaw]);
  const overpayCount = useMemo(() => rowsRaw.filter((r) => r.balance < -0.5).length, [rowsRaw]);
  const money = (n: number) => `${n.toFixed(0)} ₴`;

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rowsRaw) for (const c of r.children) if (c.group_id) m.set(c.group_id, c.group_name ?? "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rowsRaw]);

  return (
    <>
      <KpiGrid
        items={[
          { label: "Нараховано (вікно)", value: money(totals.window_charged) },
          { label: "Оплачено (вікно)", value: money(totals.window_paid), tone: "text-emerald-700" },
          { label: "Залишок до сплати", value: money(Math.max(0, totals.balance)), tone: "text-amber-700" },
          { label: "Частково оплачено", value: String(partialCount), tone: "text-blue-700" },
          ...(overpayCount > 0
            ? [{ label: "Переплата", value: String(overpayCount), tone: "text-emerald-700" }]
            : []),
        ]}
      />

      <SectionCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <label className="text-xs">Вікно з</label>
            <Input type="month" value={from.slice(0, 7)} onChange={(e) => setFrom(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Вікно по</label>
            <Input type="month" value={to.slice(0, 7)} onChange={(e) => setTo(e.target.value + "-01")} />
          </div>
          <div>
            <label className="text-xs">Статус</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                <SelectItem value="debt">До сплати</SelectItem>
                <SelectItem value="credit">Переплата</SelectItem>
                <SelectItem value="paid">Сплачено</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Група</label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Пошук клієнта або дитини</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Прізвище, ім'я..." />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(0)); setTo(firstOfMonth(0)); }}>Поточний місяць</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(-1)); setTo(firstOfMonth(-1)); }}>Попередній місяць</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(1)); setTo(firstOfMonth(1)); }}>Наступний місяць</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(firstOfMonth(-2)); setTo(firstOfMonth(0)); }}>3 місяці</Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom("2020-01-01"); setTo(firstOfMonth(6)); }}>Вся історія</Button>
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
                  <th className="py-2 pl-2 pr-2 w-8"></th>
                  <th className="py-2 pr-2 w-10">№</th>
                  <th className="py-2 pr-4">Клієнт</th>
                  <th className="py-2 pr-4">Діти</th>
                  <th className="py-2 pr-4">Група</th>
                  <th className="py-2 pr-4 text-right">Актуальний баланс</th>
                  <th className="py-2 pr-4">Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const open = expandedClient === r.client_id;
                  const status =
                    r.balance > 0.5 ? { tone: "warning" as const, label: "До сплати" }
                    : r.balance < -0.5 ? { tone: "success" as const, label: "Переплата" }
                    : { tone: "neutral" as const, label: "Сплачено" };
                  return (
                    <>
                      <tr key={r.client_id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 pl-2 pr-2">
                          <button onClick={() => setExpandedClient(open ? null : r.client_id)} className="text-muted-foreground hover:text-foreground">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-4">
                          <Link to="/clients/$id" params={{ id: r.client_id }} className="font-medium text-primary hover:underline">
                            {r.client_name}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.children.length === 0 ? "—" : r.children.map((c) => c.name).join(", ")}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {r.children.map((c) => c.group_name).filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className={`py-2 pr-4 text-right font-semibold ${r.balance > 0 ? "text-amber-700" : r.balance < 0 ? "text-emerald-700" : ""}`}>
                          {money(r.balance)}
                        </td>
                        <td className="py-2 pr-4"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                      </tr>
                      {open ? (
                        <tr key={`${r.client_id}-expanded`} className="border-b bg-muted/20">
                          <td></td>
                          <td colSpan={6} className="py-3 pr-4">
                            <ClientMonthlyPanel
                              clientId={r.client_id}
                              clientName={r.client_name}
                              showAll={showAllHistory.has(r.client_id)}
                              onToggleHistory={() => setShowAllHistory((prev) => {
                                const n = new Set(prev);
                                if (n.has(r.client_id)) n.delete(r.client_id); else n.add(r.client_id);
                                return n;
                              })}
                              onPay={(charge_id, period_month, remaining) => setPayFor({ client_id: r.client_id, client_name: r.client_name, charge_id, period_month, remaining })}
                            />
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

      {payFor ? (
        <AddPaymentPerMonthModal
          info={payFor}
          branchId={branch.id}
          methods={(lookups?.paymentMethods ?? []).filter((m: any) => !m.branch_id || m.branch_id === branch.id)}
          onClose={() => setPayFor(null)}
        />
      ) : null}
    </>
  );
}

function ClientMonthlyPanel({
  clientId, clientName, showAll, onToggleHistory, onPay,
}: {
  clientId: string;
  clientName: string;
  showAll: boolean;
  onToggleHistory: () => void;
  onPay: (charge_id: string, period_month: string, remaining: number) => void;
}) {
  const ledgerFn = useServerFn(getClientLedger);
  const { data } = useQuery({
    queryKey: ["client-ledger", clientId],
    queryFn: () => ledgerFn({ data: { client_id: clientId } }),
  });

  const charges = (data?.charges ?? []).filter((c: any) => c.status !== "cancelled");
  const defaultMonths = [firstOfMonth(0), firstOfMonth(-1), firstOfMonth(-2)];
  const isDefault = (pm: string) => defaultMonths.includes(String(pm).slice(0, 10));

  // Newest first (current month top)
  const sorted = [...charges].sort((a: any, b: any) => String(b.period_month).localeCompare(String(a.period_month)));
  const visible = showAll ? sorted : sorted.filter((c: any) => isDefault(String(c.period_month).slice(0, 10)));

  // Group payment allocations per charge
  const allocsByCharge = useMemo(() => {
    const m = new Map<string, { payment_id: string; amount: number; paid_at: string; method: string | null }[]>();
    for (const p of data?.payments ?? []) {
      if ((p as any).status && (p as any).status !== "posted") continue;
      for (const a of (p as any).allocations ?? []) {
        const arr = m.get(a.charge_id) ?? [];
        arr.push({ payment_id: p.id, amount: Number(a.amount), paid_at: (p as any).paid_at, method: (p as any).payment_methods?.name ?? null });
        m.set(a.charge_id, arr);
      }
    }
    return m;
  }, [data]);

  const money = (n: number) => `${n.toFixed(0)} ₴`;

  if (visible.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Немає нарахувань для {clientName} у стандартному вікні (поточний, минулий, позаминулий місяць).
        <Button size="sm" variant="link" className="h-auto px-1 text-xs" onClick={onToggleHistory}>
          {showAll ? "Сховати історію" : "Показати всю історію"}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pl-3 pr-2">Місяць</th>
              <th className="py-1.5 pr-2 text-right">Нараховано</th>
              <th className="py-1.5 pr-2 text-right">Оплачено</th>
              <th className="py-1.5 pr-2 text-right">Залишок</th>
              <th className="py-1.5 pr-2">Статус</th>
              <th className="py-1.5 pr-3 text-right">Дія</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c: any) => {
              const amt = Number(c.amount);
              const paid = Number(c.paid_amount ?? 0);
              const remaining = Math.max(0, amt - paid);
              const parts = allocsByCharge.get(c.id) ?? [];
              return (
                <>
                  <tr key={c.id} className="border-t">
                    <td className="py-1.5 pl-3 pr-2 font-medium">{monthLabel(c.period_month)}</td>
                    <td className="py-1.5 pr-2 text-right">{money(amt)}</td>
                    <td className="py-1.5 pr-2 text-right text-emerald-700">{money(paid)}</td>
                    <td className="py-1.5 pr-2 text-right text-amber-700">{remaining > 0 ? money(remaining) : "—"}</td>
                    <td className="py-1.5 pr-2"><InvoiceStatus status={c.status} /></td>
                    <td className="py-1.5 pr-3 text-right">
                      {remaining > 0 ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPay(c.id, c.period_month, remaining)}>
                          <Plus className="mr-1 h-3 w-3" /> Додати оплату
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                  {parts.length > 0 ? (
                    <tr key={`${c.id}-parts`} className="border-t bg-muted/10 text-[11px] text-muted-foreground">
                      <td colSpan={6} className="py-1 pl-6 pr-3">
                        <span className="mr-2">Оплати:</span>
                        {parts.map((p, i) => (
                          <span key={i} className="mr-3">
                            {String(p.paid_at).slice(0, 10)} · {money(p.amount)}{p.method ? ` · ${p.method}` : ""}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs">
        <Button size="sm" variant="link" className="h-auto px-0 text-xs" onClick={onToggleHistory}>
          {showAll ? "Сховати повну історію" : "Показати всю історію"}
        </Button>
      </div>
    </div>
  );
}

function AddPaymentPerMonthModal({
  info, branchId, methods, onClose,
}: {
  info: { client_id: string; client_name: string; charge_id: string; period_month: string; remaining: number };
  branchId: string;
  methods: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const payFn = useServerFn(recordPayment);
  const [amount, setAmount] = useState(String(Math.round(info.remaining)));
  const [paidAt, setPaidAt] = useState(todayISO());
  const [methodId, setMethodId] = useState<string>(methods[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Некоректна сума");
      const alloc = Math.min(n, info.remaining);
      return payFn({
        data: {
          client_id: info.client_id,
          branch_id: branchId,
          amount: n,
          paid_at: new Date(paidAt).toISOString(),
          payment_method_id: methodId || null,
          note: note || null,
          external_ref: ref || null,
          allocations: alloc > 0 ? [{ charge_id: info.charge_id, amount: alloc }] : undefined,
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success("Оплату додано", {
        description: res.credited > 0 ? `Залишок ${res.credited.toFixed(0)} ₴ у кредит` : `Розподілено на ${monthLabel(info.period_month)}`,
      });
      qc.invalidateQueries({ queryKey: ["client-balances"] });
      qc.invalidateQueries({ queryKey: ["client-ledger", info.client_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Додати оплату</h3>
        <p className="text-sm text-muted-foreground">
          {info.client_name} · {monthLabel(info.period_month)} · залишок {info.remaining.toFixed(0)} ₴
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs">Сума (₴)</label>
            <Input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              За замовчуванням дорівнює залишку. Можна ввести меншу для часткової оплати.
            </p>
          </div>
          <div>
            <label className="text-xs">Дата</label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Метод</label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs">Референс</label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="напр. bank_tx_12345" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs">Нотатка</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Скасувати</Button>
          <Button onClick={() => { setBusy(true); mut.mutate(); }} disabled={busy || !amount}>
            <Wallet className="mr-1 h-3.5 w-3.5" /> Провести
          </Button>
        </div>
      </div>
    </div>
  );
}
