import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type FunnelStage = {
  key: string;
  label: string;
  statuses: string[];
  tone: string;
};

// Practical funnel grouping over existing lead_status values.
export const FUNNEL_STAGES: FunnelStage[] = [
  { key: "new", label: "Нові", statuses: ["new"], tone: "bg-blue-500" },
  {
    key: "working",
    label: "В роботі",
    statuses: ["contacted", "negotiation"],
    tone: "bg-indigo-500",
  },
  {
    key: "visit",
    label: "Візит / пробний",
    statuses: ["tour_scheduled", "tour_done", "trial"],
    tone: "bg-fuchsia-500",
  },
  { key: "waiting", label: "Очікування", statuses: ["waiting"], tone: "bg-slate-500" },
  { key: "contract", label: "Договір", statuses: ["contract"], tone: "bg-teal-500" },
  {
    key: "converted",
    label: "Конвертовані",
    statuses: ["converted", "won"],
    tone: "bg-emerald-500",
  },
  { key: "lost", label: "Втрачені", statuses: ["lost", "archived"], tone: "bg-rose-500" },
];

type Lead = { status?: string | null };

export function LeadsFunnel({
  leads,
  activeStatuses,
  onSelectStage,
}: {
  leads: Lead[];
  activeStatuses: string[]; // currently applied status filter values ([] = all)
  onSelectStage: (statuses: string[]) => void;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leads) {
      const s = l.status ?? "";
      map[s] = (map[s] ?? 0) + 1;
    }
    return map;
  }, [leads]);

  const stageCounts = FUNNEL_STAGES.map((st) => ({
    ...st,
    count: st.statuses.reduce((a, s) => a + (counts[s] ?? 0), 0),
  }));
  const max = Math.max(1, ...stageCounts.map((s) => s.count));
  const total = stageCounts.reduce((a, s) => a + s.count, 0);

  const activeSet = new Set(activeStatuses);
  const isStageActive = (st: FunnelStage) =>
    st.statuses.length > 0 && st.statuses.every((s) => activeSet.has(s)) && activeStatuses.length === st.statuses.length;

  return (
    <div className="mb-4 rounded-xl border bg-card/60 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-medium text-foreground">Воронка лідів</div>
        <div className="text-xs text-muted-foreground">Усього: {total}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stageCounts.map((st) => {
          const pct = Math.round((st.count / max) * 100);
          const active = isStageActive(st);
          return (
            <button
              key={st.key}
              type="button"
              onClick={() => onSelectStage(active ? [] : st.statuses)}
              className={cn(
                "group flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition hover:border-foreground/30",
                active ? "border-foreground/50 bg-accent" : "border-border/60 bg-background",
              )}
              aria-pressed={active}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/80">{st.label}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">{st.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", st.tone)} style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
