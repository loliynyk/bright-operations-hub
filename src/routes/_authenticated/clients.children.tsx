import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState, SearchInput } from "@/components/ds";
import { useBranch } from "@/lib/branch-context";
import { listChildrenByGroup } from "@/lib/finance.functions";
import { childStatusLabel, contractStatusLabel } from "@/lib/child-validation";

export const Route = createFileRoute("/_authenticated/clients/children")({
  component: ChildrenPage,
  head: () => ({ meta: [
    { title: "Діти — Bright OS" },
    { name: "description", content: "Список дітей по групах з місткістю та заборгованістю." },
  ] }),
});

type StateFilter = "all" | "active" | "upcoming" | "leaving";

function ageFromBirth(iso?: string | null): string {
  if (!iso) return "—";
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return "—";
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years -= 1;
  return `${years} р.`;
}

function ChildrenPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listChildrenByGroup);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["children-by-group", branch.id, showArchived],
    queryFn: () => fn({ data: { branch_id: branch.id, show_archived: showArchived } }),
  });

  const filtered = useMemo(() => {
    if (!data) return null;
    const s = search.toLowerCase().trim();
    const filt = (arr: any[]) => arr.filter((c) => {
      if (s && !`${c.first_name} ${c.last_name ?? ""} ${c.parent_name}`.toLowerCase().includes(s)) return false;
      if (stateFilter === "active" && !(c.state === "active" || c.state === "leaving")) return false;
      if (stateFilter === "upcoming" && c.state !== "upcoming") return false;
      if (stateFilter === "leaving" && c.state !== "leaving") return false;
      return true;
    });
    return {
      groups: data.groups.map((g: any) => ({ ...g, children: filt(g.children) })),
      no_group: filt(data.no_group),
    };
  }, [data, search, stateFilter]);

  return (
    <PageContainer>
      <PageHeader
        title="Діти"
        description="Розподіл по групах, місткість та поточна заборгованість."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук дитини..." className="w-56" />
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as StateFilter)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Фільтр стану"
            >
              <option value="all">Всі</option>
              <option value="active">Активні</option>
              <option value="upcoming">Заплановані</option>
              <option value="leaving">Завершуються</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              архівні
            </label>
          </div>
        }
      />
      {isLoading || !filtered ? (
        <p className="text-sm text-muted-foreground">Завантаження...</p>
      ) : filtered.groups.length === 0 && filtered.no_group.length === 0 ? (
        <EmptyState icon={Users} title="Дітей ще немає" description="Створіть клієнта та додайте дитину, щоб вона з'явилася тут." />
      ) : (
        <div className="space-y-6">
          {filtered.groups.map((g: any) => (
            <GroupCard key={g.group.id} group={g.group} rows={g.children} activeCount={g.active_count} upcoming={g.upcoming} leaving={g.leaving} />
          ))}
          {filtered.no_group.length > 0 ? (
            <GroupCard group={{ name: "Без групи", age_range: null, capacity: null }} rows={filtered.no_group} activeCount={filtered.no_group.filter((c: any) => c.state === "active" || c.state === "leaving").length} upcoming={filtered.no_group.filter((c: any) => c.state === "upcoming").length} leaving={filtered.no_group.filter((c: any) => c.state === "leaving").length} />
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}

function GroupCard({ group, rows, activeCount, upcoming, leaving }: any) {
  const capacity = group.capacity ?? null;
  const available = capacity != null ? Math.max(0, capacity - activeCount) : null;
  const fill = capacity ? Math.min(1, activeCount / capacity) : 0;
  const over = capacity != null && activeCount > capacity;
  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Група</p>
          <h2 className="text-lg font-semibold">{group.name}</h2>
          {group.age_range ? <p className="text-xs text-muted-foreground">{group.age_range}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-muted-foreground">Активні: <span className="font-semibold text-foreground">{activeCount}{capacity ? ` / ${capacity}` : ""}</span></span>
          {available != null ? <span className={over ? "text-destructive font-semibold" : "text-muted-foreground"}>Місць: {available}</span> : null}
          {upcoming ? <span className="text-primary">Заплановано: {upcoming}</span> : null}
          {leaving ? <span className="text-amber-600">Завершуються: {leaving}</span> : null}
          {over ? <StatusBadge tone="destructive">Перевищено</StatusBadge> : capacity && fill >= 0.85 ? <StatusBadge tone="warning">Майже повна</StatusBadge> : null}
        </div>
      </div>
      {capacity ? (
        <div className="mb-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${over ? "bg-destructive" : fill > 0.85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(fill, 1) * 100}%` }} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає дітей за поточними фільтрами.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Дитина</th>
                <th className="py-2 pr-4">Батьки</th>
                <th className="py-2 pr-4 hidden md:table-cell">Телефон</th>
                <th className="py-2 pr-4 hidden lg:table-cell">Вік</th>
                <th className="py-2 pr-4 hidden lg:table-cell">Початок</th>
                <th className="py-2 pr-4 hidden lg:table-cell">Завершення</th>
                <th className="py-2 pr-4 hidden md:table-cell">Договір</th>
                <th className="py-2 pr-4 hidden md:table-cell">План / Послуга</th>
                <th className="py-2 pr-4 text-right">Абонплата</th>
                <th className="py-2 pr-4 text-right">Борг</th>
                <th className="py-2 pr-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{c.first_name} {c.last_name ?? ""}</td>
                  <td className="py-2 pr-4">
                    <Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">{c.parent_name || "—"}</Link>
                  </td>
                  <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground">{c.parent_phone ?? "—"}</td>
                  <td className="py-2 pr-4 hidden lg:table-cell text-muted-foreground">{ageFromBirth(c.birth_date)}</td>
                  <td className="py-2 pr-4 hidden lg:table-cell text-muted-foreground">{c.start_date ?? "—"}</td>
                  <td className="py-2 pr-4 hidden lg:table-cell text-muted-foreground">{c.end_date ?? "—"}</td>
                  <td className="py-2 pr-4 hidden md:table-cell">{c.contract_status ? <StatusBadge tone={c.contract_status === "draft" ? "warning" : "success"}>{contractStatusLabel(c.contract_status)}</StatusBadge> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground">{c.plan_name ?? c.service_name ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">{c.monthly_price != null ? `${c.monthly_price} ₴` : "—"}</td>
                  <td className={`py-2 pr-4 text-right ${c.debt > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{c.debt > 0 ? `${c.debt} ₴` : "—"}</td>
                  <td className="py-2 pr-4"><StatusBadge tone={toneForChild(c.status)}>{childStatusLabel(c.status)}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function toneForChild(status: string): any {
  switch (status) {
    case "active": return "success";
    case "paused": return "warning";
    case "graduated": return "info";
    case "archived": return "neutral";
    default: return "neutral";
  }
}
