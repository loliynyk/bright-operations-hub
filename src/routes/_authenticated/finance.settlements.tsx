import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Users2, X } from "lucide-react";
import { useBranch } from "@/lib/branch-context";
import { getSettlements, getClientFinance } from "@/lib/finance.functions";
import { listLookups } from "@/lib/lookups.functions";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChargesPage } from "./finance.charges";
import { PaymentsPage } from "./finance.payments";

export const Route = createFileRoute("/_authenticated/finance/settlements")({
  component: SettlementsPage,
  head: () => ({ meta: [
    { title: "Розрахунки — Bright OS" },
    { name: "description", content: "Єдиний робочий простір: хто нарахований, хто оплатив, що залишилось, що прострочено." },
  ] }),
});

type Lens = "all" | "debt" | "overdue" | "credit" | "paid";
type StatusFilter = "all" | "has_debt" | "overdue" | "has_credit";
type AgingFilter = "any" | "current" | "1_30" | "31_60" | "61_90" | "90_plus";

function SettlementsPage() {
  const { branch } = useBranch();
  const settlementsFn = useServerFn(getSettlements);
  const lookupsFn = useServerFn(listLookups);

  const [period, setPeriod] = useState(() => currentMonthISO());
  const [tab, setTab] = useState("clients");
  const [lens, setLens] = useState<Lens>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aging, setAging] = useState<AgingFilter>("any");
  const [groupId, setGroupId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const from = period + "-01";
  const to = endOfMonth(period);

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", branch.id, from, to, groupId],
    queryFn: () => settlementsFn({ data: { branch_id: branch.id, from, to, group_id: groupId === "all" ? null : groupId } }),
  });

  const { data: lookups } = useQuery({
    queryKey: ["lookups"],
    queryFn: () => lookupsFn(),
  });

  const activeGroups = (lookups?.groups ?? []).filter((g: any) => !branch.id || g.branch_id === branch.id);

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter((r) => {
      // Lens
      if (lens === "debt" && r.total_debt <= 0.005) return false;
      if (lens === "overdue" && r.overdue_debt <= 0.005) return false;
      if (lens === "credit" && r.credit <= 0.005) return false;
      if (lens === "paid" && r.period_paid <= 0.005) return false;
      // Status filter
      if (statusFilter === "has_debt" && r.total_debt <= 0.005) return false;
      if (statusFilter === "overdue" && r.overdue_debt <= 0.005) return false;
      if (statusFilter === "has_credit" && r.credit <= 0.005) return false;
      // Aging
      if (aging !== "any") {
        const d = r.max_days_overdue;
        if (aging === "current" && d > 0) return false;
        if (aging === "1_30" && !(d >= 1 && d <= 30)) return false;
        if (aging === "31_60" && !(d >= 31 && d <= 60)) return false;
        if (aging === "61_90" && !(d >= 61 && d <= 90)) return false;
        if (aging === "90_plus" && d < 91) return false;
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        const inName = r.client_name.toLowerCase().includes(s);
        const inChild = r.children.some((c) => c.name.toLowerCase().includes(s));
        const inPhone = (r.phone ?? "").toLowerCase().includes(s);
        if (!inName && !inChild && !inPhone) return false;
      }
      return true;
    });
  }, [data, lens, statusFilter, aging, search]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const totals = data?.totals ?? { charged: 0, paid: 0, debt: 0, overdue: 0, credit: 0 };
  const anyFilter = lens !== "all" || statusFilter !== "all" || aging !== "any" || groupId !== "all" || search.trim() !== "";

  return (
    <PageContainer>
      <PageHeader
        title="Розрахунки"
        description="Хто нарахований, хто оплатив, що залишилось і що прострочено — в одному місці."
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <KpiTile label="Нараховано" value={totals.charged} active={lens === "all"} onClick={() => { setLens("all"); setTab("clients"); }} />
        <KpiTile label="Оплачено" value={totals.paid} tone="text-emerald-600" active={lens === "paid"} onClick={() => { setLens(lens === "paid" ? "all" : "paid"); setTab("clients"); }} />
        <KpiTile label="Борг" value={totals.debt} tone={totals.debt > 0 ? "text-destructive" : ""} active={lens === "debt"} onClick={() => { setLens(lens === "debt" ? "all" : "debt"); setTab("clients"); }} />
        <KpiTile label="Прострочено" value={totals.overdue} tone={totals.overdue > 0 ? "text-destructive" : ""} active={lens === "overdue"} onClick={() => { setLens(lens === "overdue" ? "all" : "overdue"); setTab("clients"); }} />
        <KpiTile label="Кредит" value={totals.credit} tone={totals.credit > 0 ? "text-primary" : ""} active={lens === "credit"} onClick={() => { setLens(lens === "credit" ? "all" : "credit"); setTab("clients"); }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clients">Клієнти</TabsTrigger>
          <TabsTrigger value="charges">Нарахування</TabsTrigger>
          <TabsTrigger value="payments">Платежі</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          <SectionCard className="mb-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className="text-xs">Пошук</label>
                <Input placeholder="Клієнт, дитина або телефон..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Стан</label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі</SelectItem>
                    <SelectItem value="has_debt">Є борг</SelectItem>
                    <SelectItem value="overdue">Прострочено</SelectItem>
                    <SelectItem value="has_credit">Є кредит</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs">Старіння</label>
                <Select value={aging} onValueChange={(v) => setAging(v as AgingFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Будь-яке</SelectItem>
                    <SelectItem value="current">Поточний</SelectItem>
                    <SelectItem value="1_30">1–30</SelectItem>
                    <SelectItem value="31_60">31–60</SelectItem>
                    <SelectItem value="61_90">61–90</SelectItem>
                    <SelectItem value="90_plus">90+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs">Група</label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі групи</SelectItem>
                    {activeGroups.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {anyFilter ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Активний фільтр: {filtered.length} з {(data?.rows ?? []).length}</span>
                <Button size="sm" variant="ghost" onClick={() => { setLens("all"); setStatusFilter("all"); setAging("any"); setGroupId("all"); setSearch(""); }}>
                  <X className="h-3 w-3 mr-1" />Скинути
                </Button>
              </div>
            ) : null}
          </SectionCard>

          {isLoading ? <p className="text-sm text-muted-foreground">Завантаження...</p> :
          filtered.length === 0 ? (
            <EmptyState icon={Users2} title="Клієнтів не знайдено" description="Змініть фільтри або період." />
          ) : (
            <SectionCard>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 w-8"></th>
                      <th className="py-2 pr-4">Клієнт</th>
                      <th className="py-2 pr-4">Дитина / діти</th>
                      <th className="py-2 pr-4">Група</th>
                      <th className="py-2 pr-4">Телефон</th>
                      <th className="py-2 pr-4 text-right">Нараховано</th>
                      <th className="py-2 pr-4 text-right">Оплачено</th>
                      <th className="py-2 pr-4 text-right">Борг</th>
                      <th className="py-2 pr-4 text-right">Прострочено</th>
                      <th className="py-2 pr-4 text-right">Кредит</th>
                      <th className="py-2 pr-4">Найстаріший</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const isOpen = expanded.has(r.client_id);
                      const groupsLabel = uniq(r.children.map((c) => c.group_name).filter(Boolean) as string[]).join(", ") || "—";
                      const childrenLabel = r.children.length === 0 ? "—" :
                        r.children.length <= 2 ? r.children.map((c) => c.name).join(", ")
                        : `${r.children[0].name} +${r.children.length - 1}`;
                      return (
                        <>
                          <tr key={r.client_id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => toggle(r.client_id)}>
                            <td className="py-2">
                              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </td>
                            <td className="py-2 pr-4">
                              <Link to="/clients/$id" params={{ id: r.client_id }} className="text-primary hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                                {r.client_name || "—"}
                              </Link>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">{childrenLabel}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{groupsLabel}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{r.phone ?? "—"}</td>
                            <td className="py-2 pr-4 text-right">{fmt(r.period_charged)}</td>
                            <td className="py-2 pr-4 text-right text-emerald-600">{fmt(r.period_paid)}</td>
                            <td className={cn("py-2 pr-4 text-right", r.total_debt > 0 && "text-destructive font-medium")}>{fmt(r.total_debt)}</td>
                            <td className={cn("py-2 pr-4 text-right", r.overdue_debt > 0 && "text-destructive font-semibold")}>{fmt(r.overdue_debt)}</td>
                            <td className={cn("py-2 pr-4 text-right", r.credit > 0 && "text-primary")}>{fmt(r.credit)}</td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground">
                              {r.oldest_unpaid_month ? format(new Date(r.oldest_unpaid_month), "LLL yyyy") : "—"}
                              {r.max_days_overdue > 0 ? <span className="text-destructive ml-1">· {r.max_days_overdue}д</span> : null}
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr key={`${r.client_id}-exp`} className="bg-muted/20">
                              <td></td>
                              <td colSpan={10} className="py-3 pr-4">
                                <ClientExpansion clientId={r.client_id} />
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
        </TabsContent>

        <TabsContent value="charges" className="mt-4">
          <div className="-mx-6 md:-mx-10 -mb-8 md:-mb-10">
            <ChargesPage />
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="-mx-6 md:-mx-10 -mb-8 md:-mb-10">
            <PaymentsPage />
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function ClientExpansion({ clientId }: { clientId: string }) {
  const fn = useServerFn(getClientFinance);
  const { data, isLoading } = useQuery({
    queryKey: ["client-finance", clientId],
    queryFn: () => fn({ data: { clientId } }),
  });
  if (isLoading || !data) return <p className="text-xs text-muted-foreground">Завантаження...</p>;
  const charges = (data.charges ?? []) as any[];
  const payments = (data.payments ?? []) as any[];
  const allocations = (data.allocations ?? []) as any[];
  const allocsByPayment = new Map<string, any[]>();
  for (const a of allocations) {
    const arr = allocsByPayment.get(a.payment_id) ?? [];
    arr.push(a); allocsByPayment.set(a.payment_id, arr);
  }
  const chargeById = new Map(charges.map((c) => [c.id, c]));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Нарахування</p>
        {charges.length === 0 ? <p className="text-xs text-muted-foreground">Немає нарахувань</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground">
              <th className="text-left py-1">Період</th>
              <th className="text-left py-1">Термін</th>
              <th className="text-right py-1">Нараховано</th>
              <th className="text-right py-1">Залишок</th>
              <th className="text-left py-1 pl-2">Статус</th>
            </tr></thead>
            <tbody>{charges.map((c) => {
              const rem = Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0));
              return (
                <tr key={c.id} className="border-t border-border/50">
                  <td className="py-1">{format(new Date(c.period_month), "LLL yyyy")}{c.is_prorated ? " •пр" : ""}</td>
                  <td className="py-1 text-muted-foreground">{c.due_date ?? "—"}</td>
                  <td className="py-1 text-right">{Number(c.amount).toFixed(0)}</td>
                  <td className={cn("py-1 text-right", rem > 0 && "text-destructive font-medium")}>{rem.toFixed(0)}</td>
                  <td className="py-1 pl-2 text-muted-foreground">{c.status}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Платежі</p>
          <div className="flex items-center gap-3">
            <Link to="/clients/$id" params={{ id: clientId }} search={{ tab: "finance" }} className="text-xs font-medium text-primary hover:underline">+ Додати платіж</Link>
            <Link to="/clients/$id" params={{ id: clientId }} className="text-xs text-primary hover:underline">Відкрити клієнта →</Link>
          </div>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">Автоматичний FIFO-розподіл на найстаріші відкриті нарахування; надлишок стає кредитом.</p>
        {payments.length === 0 ? <p className="text-xs text-muted-foreground">Платежів немає</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground">
              <th className="text-left py-1">Дата</th>
              <th className="text-right py-1">Сума</th>
              <th className="text-left py-1 pl-2">Розподіл</th>
              <th className="text-left py-1 pl-2">Статус</th>
            </tr></thead>
            <tbody>{payments.slice(0, 8).map((p) => {
              const pa = allocsByPayment.get(p.id) ?? [];
              const allocSum = pa.reduce((s, a) => s + Number(a.amount), 0);
              const credit = Math.max(0, Number(p.amount) - allocSum);
              return (
                <tr key={p.id} className="border-t border-border/50 align-top">
                  <td className="py-1">{format(new Date(p.paid_at), "dd.MM.yy")}</td>
                  <td className="py-1 text-right font-medium">{Number(p.amount).toFixed(0)}</td>
                  <td className="py-1 pl-2 text-muted-foreground">
                    {p.status === "void" ? "—" : pa.length === 0 ? <span className="text-amber-600">кредит {credit.toFixed(0)}</span> :
                      pa.map((a) => {
                        const ch = chargeById.get(a.charge_id);
                        return <div key={a.id}>{ch ? format(new Date(ch.period_month), "LLL yyyy") : "?"}: {Number(a.amount).toFixed(0)}</div>;
                      })}
                    {credit > 0.005 && pa.length > 0 && p.status !== "void" ? <div className="text-amber-600">+ кредит {credit.toFixed(0)}</div> : null}
                  </td>
                  <td className="py-1 pl-2 text-muted-foreground">{p.status === "void" ? "Скасовано" : "Проведено"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {(data.credits ?? []).length > 0 ? (
          <p className="mt-2 text-xs text-primary">
            Кредит клієнта: {(data.credits ?? []).reduce((s: number, c: any) => s + Number(c.amount_remaining), 0).toFixed(0)} ₴
          </p>
        ) : null}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone = "", active, onClick }: { label: string; value: number; tone?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition hover:border-primary/50",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", tone || "text-foreground")}>{fmt(value)}</p>
    </button>
  );
}

function fmt(n: number) { return n > 0 ? `${n.toFixed(0)} ₴` : "—"; }
function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function currentMonthISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function endOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
