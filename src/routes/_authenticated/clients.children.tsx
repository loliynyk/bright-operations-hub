import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState, SearchInput } from "@/components/ds";
import { useBranch } from "@/lib/branch-context";
import { listChildrenByGroup } from "@/lib/finance.functions";

export const Route = createFileRoute("/_authenticated/clients/children")({
  component: ChildrenPage,
  head: () => ({ meta: [
    { title: "Діти — Bright OS" },
    { name: "description", content: "Список дітей по групах з місткістю та заборгованістю." },
  ] }),
});

function ChildrenPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listChildrenByGroup);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["children-by-group", branch.id, showArchived],
    queryFn: () => fn({ data: { branch_id: branch.id, show_archived: showArchived } }),
  });

  const filtered = useMemo(() => {
    if (!data) return null;
    const s = search.toLowerCase().trim();
    const filt = (arr: any[]) => s ? arr.filter((c) =>
      `${c.first_name} ${c.last_name ?? ""} ${c.parent_name}`.toLowerCase().includes(s)) : arr;
    return {
      groups: data.groups.map((g: any) => ({ ...g, active: filt(g.active) })),
      no_group: filt(data.no_group),
    };
  }, [data, search]);

  return (
    <PageContainer>
      <PageHeader
        title="Діти"
        description="Розподіл по групах, місткість та поточна заборгованість."
        actions={
          <div className="flex items-center gap-3">
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук дитини..." className="w-64" />
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
          {filtered.groups.map((g: any) => <GroupCard key={g.group.id} group={g.group} children={g.active} upcoming={g.upcoming} leaving={g.leaving} />)}
          {filtered.no_group.length > 0 ? (
            <GroupCard group={{ name: "Без групи", age_range: null, capacity: null }} children={filtered.no_group} upcoming={[]} leaving={[]} />
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}

function GroupCard({ group, children, upcoming, leaving }: any) {
  const capacity = group.capacity ?? null;
  const fill = capacity ? Math.min(1, children.length / capacity) : 0;
  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Група</p>
          <h2 className="text-lg font-semibold">{group.name}</h2>
          {group.age_range ? <p className="text-xs text-muted-foreground">{group.age_range}</p> : null}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Всього: <span className="font-semibold text-foreground">{children.length}{capacity ? ` / ${capacity}` : ""}</span></span>
          {upcoming?.length ? <span className="text-primary">Заплановано: {upcoming.length}</span> : null}
          {leaving?.length ? <span className="text-amber-600">Завершується: {leaving.length}</span> : null}
        </div>
      </div>
      {capacity ? (
        <div className="mb-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${fill >= 1 ? "bg-destructive" : fill > 0.85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${fill * 100}%` }} />
        </div>
      ) : null}
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">У цій групі поки немає дітей.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Дитина</th>
                <th className="py-2 pr-4">Батьки</th>
                <th className="py-2 pr-4">Дата народж.</th>
                <th className="py-2 pr-4">Договір</th>
                <th className="py-2 pr-4">Абонплата</th>
                <th className="py-2 pr-4 text-right">Борг</th>
                <th className="py-2 pr-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              {children.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{c.first_name} {c.last_name ?? ""}</td>
                  <td className="py-2 pr-4">
                    <Link to="/clients/$id" params={{ id: c.client_id }} className="text-primary hover:underline">{c.parent_name || "—"}</Link>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.birth_date ?? "—"}</td>
                  <td className="py-2 pr-4">{c.contract_status ? <StatusBadge tone={c.contract_status === "draft" ? "warning" : "success"}>{c.contract_status}</StatusBadge> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2 pr-4">{c.monthly_price != null ? `${c.monthly_price} ₴` : "—"}</td>
                  <td className={`py-2 pr-4 text-right ${c.debt > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{c.debt > 0 ? `${c.debt} ₴` : "—"}</td>
                  <td className="py-2 pr-4"><ChildStatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function ChildStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    active: { tone: "success", label: "Активна" },
    paused: { tone: "warning", label: "Пауза" },
    graduated: { tone: "info", label: "Випущена" },
    archived: { tone: "neutral", label: "Архів" },
  };
  const s = map[status] ?? { tone: "neutral" as const, label: status };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
