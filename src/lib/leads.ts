export const LEAD_STATUSES = [
  { value: "new", label: "Новий", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { value: "contacted", label: "На зв'язку", tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  { value: "tour_scheduled", label: "Екскурсія призначена", tone: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { value: "tour_done", label: "Екскурсія проведена", tone: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  { value: "negotiation", label: "Переговори", tone: "bg-amber-500/20 text-amber-800 dark:text-amber-300" },
  { value: "won", label: "Оформлений", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "lost", label: "Втрачений", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

export const LEAD_SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "referral", label: "Рекомендація" },
  { value: "walk_in", label: "Прийшли особисто" },
  { value: "phone", label: "Дзвінок" },
  { value: "other", label: "Інше" },
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number]["value"];

export function statusLabel(s: string) {
  return LEAD_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function statusTone(s: string) {
  return LEAD_STATUSES.find((x) => x.value === s)?.tone ?? "bg-muted text-foreground";
}
export function sourceLabel(s?: string | null) {
  if (!s) return "—";
  return LEAD_SOURCES.find((x) => x.value === s)?.label ?? s;
}
