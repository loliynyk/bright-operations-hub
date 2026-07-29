import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { listLeadStatuses } from "@/lib/settings.functions";
import { LEAD_STATUSES as FALLBACK } from "@/lib/leads";

export type LeadStatusRow = {
  id: string;
  code: string;
  label: string;
  tone: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

const FALLBACK_ROWS: LeadStatusRow[] = FALLBACK.map((s, i) => ({
  id: `fallback-${s.value}`,
  code: s.value,
  label: s.label,
  tone: s.tone,
  sort_order: (i + 1) * 10,
  is_active: true,
  is_system: ["new", "converted", "archived", "lost"].includes(s.value),
}));

export function useLeadStatuses() {
  const fn = useServerFn(listLeadStatuses);
  const { data } = useQuery({
    queryKey: ["lead-statuses"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const rows = (data as LeadStatusRow[] | undefined)?.length ? (data as LeadStatusRow[]) : FALLBACK_ROWS;

  return useMemo(() => {
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const all = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    const active = all.filter((r) => r.is_active);
    const label = (code?: string | null) => (code ? byCode.get(code)?.label ?? code : "—");
    const tone = (code?: string | null) => (code ? byCode.get(code)?.tone ?? "bg-muted text-foreground" : "bg-muted text-foreground");
    // Assignable options: active statuses PLUS the current value even if inactive (so historical rows keep selection).
    const assignableFor = (currentCode?: string | null) => {
      if (!currentCode || byCode.get(currentCode)?.is_active) return active;
      const cur = byCode.get(currentCode);
      return cur ? [...active, cur] : active;
    };
    return { all, active, byCode, label, tone, assignableFor };
  }, [rows]);
}
