import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Users,
  Baby,
  UserPlus,
  Wallet,
  ArrowUpRight,
  CircleDollarSign,
  AlertCircle,
  Cake,
  CalendarClock,
  CalendarX,
  Plus,
  Building2,
} from "lucide-react";
import { MetricCard, SectionCard, SecondaryButton, StatusBadge } from "@/components/ds";
import { KpiGrid } from "@/components/ds/kpi-grid";
import { Progress } from "@/components/ui/progress";
import { useBranch } from "@/lib/branch-context";
import { getOverviewDashboard } from "@/lib/overview.functions";
import { statusLabel } from "@/lib/leads";
import { formatDate } from "@/components/ds/data-table";

const fmt = (n: number) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(n);
const fmtMoney = (n: number) => `${fmt(n)} ₴`;

export function OverviewDashboard() {
  const { branch } = useBranch();
  const fn = useServerFn(getOverviewDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["overview-dashboard", branch.id],
    queryFn: () => fn({ data: { branchId: branch.id } }),
    enabled: !!branch.id,
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Завантаження дашборду…</p>;
  }

  const { kpi, leadsByStage, newLeadsThisMonth, convertedThisMonth, occupancy, contractsStarting, contractsEnding, outstandingClients, birthdaysThisMonth, recent } = data;
  const conversion = newLeadsThisMonth > 0 ? Math.round((convertedThisMonth / newLeadsThisMonth) * 100) : 0;
  const stageEntries = Object.entries(leadsByStage).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxStage = Math.max(1, ...stageEntries.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <KpiGrid className="lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Активні клієнти" value={fmt(kpi.activeClients)} icon={Users} tone="primary" />
        <MetricCard label="Активні діти" value={fmt(kpi.activeChildren)} icon={Baby} tone="info" />
        <MetricCard label="Відкриті ліди" value={fmt(kpi.openLeads)} icon={UserPlus} tone="warning" />
        <MetricCard label="Нараховано (міс.)" value={fmtMoney(kpi.chargedMonth)} icon={CircleDollarSign} tone="neutral" />
        <MetricCard label="Оплачено (міс.)" value={fmtMoney(kpi.paidMonth)} icon={Wallet} tone="success" />
        <MetricCard label="Заборгованість" value={fmtMoney(kpi.outstanding)} icon={AlertCircle} tone={kpi.outstanding > 0 ? "danger" : "neutral"} />
      </KpiGrid>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link to="/leads"><SecondaryButton size="sm"><Plus className="mr-1.5 h-4 w-4" /> Додати ліда</SecondaryButton></Link>
        <Link to="/clients"><SecondaryButton size="sm"><Users className="mr-1.5 h-4 w-4" /> Клієнти</SecondaryButton></Link>
        <Link to="/finance/settlements"><SecondaryButton size="sm"><CircleDollarSign className="mr-1.5 h-4 w-4" /> Фінанси</SecondaryButton></Link>
        <Link to="/admin/groups"><SecondaryButton size="sm"><Building2 className="mr-1.5 h-4 w-4" /> Групи</SecondaryButton></Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads by stage */}
        <SectionCard title="Ліди за стадіями" description={`Нові цього місяця: ${newLeadsThisMonth} · Конвертовано: ${convertedThisMonth} (${conversion}%)`}>
          {stageEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Лідів ще немає.</p>
          ) : (
            <ul className="space-y-3">
              {stageEntries.map(([status, count]) => (
                <li key={status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{statusLabel(status)}</span>
                    <span className="tabular-nums font-medium text-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((count / maxStage) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Group occupancy */}
        <SectionCard title="Місткість груп" description="Активні діти на активну групу">
          {occupancy.length === 0 ? (
            <p className="text-sm text-muted-foreground">Активних груп немає.</p>
          ) : (
            <ul className="space-y-3">
              {occupancy.map((g) => {
                const cap = g.capacity ?? 0;
                const pct = cap ? Math.min(100, Math.round((g.enrolled / cap) * 100)) : 0;
                const over = cap > 0 && g.enrolled > cap;
                return (
                  <li key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-foreground">{g.name}</span>
                      <span className={"tabular-nums text-xs " + (over ? "text-destructive" : "text-muted-foreground")}>
                        {g.enrolled}{cap ? ` / ${cap}` : ""}
                      </span>
                    </div>
                    {cap ? <Progress value={pct} className="h-1.5" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* Contracts starting */}
        <SectionCard
          title="Стартують найближчі 14 днів"
          description={`${contractsStarting.length} договорів`}
        >
          {contractsStarting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Немає запланованих стартів.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {contractsStarting.slice(0, 8).map((c: any) => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">
                    Договір
                  </Link>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> {formatDate(c.start_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Contracts ending */}
        <SectionCard title="Завершуються 30 днів" description={`${contractsEnding.length} договорів`}>
          {contractsEnding.length === 0 ? (
            <p className="text-sm text-muted-foreground">Немає близьких завершень.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {contractsEnding.slice(0, 8).map((c: any) => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">
                    Договір
                  </Link>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarX className="h-3.5 w-3.5" /> {formatDate(c.end_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Top outstanding */}
        <SectionCard title="Найбільша заборгованість" description="Топ клієнти з непогашеними нарахуваннями">
          {outstandingClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Немає заборгованостей.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {outstandingClients.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link to="/clients/$id" params={{ id: c.id }} className="text-primary hover:underline">
                    {c.name}
                  </Link>
                  <span className="tabular-nums font-semibold text-destructive">{fmtMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Recent activity */}
        <SectionCard title="Остання активність" description="Нові ліди, клієнти та оплати">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ліди</p>
              {recent.leads.length === 0 ? <p className="text-muted-foreground">—</p> : (
                <ul className="space-y-1.5">
                  {recent.leads.map((l: any) => (
                    <li key={l.id} className="truncate">
                      <Link to="/leads/$id" params={{ id: l.id }} className="text-primary hover:underline">
                        {l.parent_name || "—"}
                      </Link>
                      <StatusBadge tone="info"><span className="ml-1 text-[10px]">{statusLabel(l.status)}</span></StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Клієнти</p>
              {recent.clients.length === 0 ? <p className="text-muted-foreground">—</p> : (
                <ul className="space-y-1.5">
                  {recent.clients.map((c: any) => (
                    <li key={c.id} className="truncate">
                      <Link to="/clients/$id" params={{ id: c.id }} className="text-primary hover:underline">
                        {c.parent_first_name} {c.parent_last_name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Оплати</p>
              {recent.payments.length === 0 ? <p className="text-muted-foreground">—</p> : (
                <ul className="space-y-1.5">
                  {recent.payments.map((p: any) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{formatDate(p.paid_at)}</span>
                      <span className="tabular-nums font-medium text-foreground">{fmtMoney(Number(p.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {birthdaysThisMonth > 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
              <Cake className="h-3.5 w-3.5" /> Днів народження цього місяця: {birthdaysThisMonth}
            </div>
          ) : null}
          <div className="mt-4 text-right">
            <Link to="/leads" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Усі ліди <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
