export const LEAD_STATUSES = [
  { value: "new", label: "Новий", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { value: "contacted", label: "Зв'язались", tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  { value: "waiting", label: "Очікує", tone: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { value: "trial", label: "Пробне заняття", tone: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { value: "tour_scheduled", label: "Екскурсія призначена", tone: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  { value: "tour_done", label: "Екскурсія проведена", tone: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  { value: "negotiation", label: "Переговори", tone: "bg-amber-500/20 text-amber-800 dark:text-amber-300" },
  { value: "contract", label: "Договір", tone: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  { value: "converted", label: "Конвертований", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "won", label: "Оформлений", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "lost", label: "Втрачений", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { value: "archived", label: "Архів", tone: "bg-muted text-muted-foreground" },
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

export const CONTRACT_STATUSES = [
  { value: "draft", label: "Чернетка" },
  { value: "generated", label: "Згенерований" },
  { value: "sent", label: "Надісланий" },
  { value: "signed", label: "Підписаний" },
  { value: "cancelled", label: "Скасований" },
  { value: "completed", label: "Завершений" },
] as const;

export function contractStatusLabel(s: string) {
  return CONTRACT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export const CLIENT_STATUSES = [
  { value: "active", label: "Активний" },
  { value: "paused", label: "Призупинений" },
  { value: "archived", label: "Архів" },
] as const;

export const CHILD_STATUSES = [
  { value: "active", label: "Активна" },
  { value: "paused", label: "Пауза" },
  { value: "graduated", label: "Випустилась" },
  { value: "archived", label: "Архів" },
] as const;

export const TIMELINE_LABELS: Record<string, string> = {
  lead_created: "Лід створено",
  status_changed: "Статус змінено",
  client_created: "Клієнта створено",
  contract_generated: "Договір створено",
  pdf_generated: "PDF згенеровано",
  charges_generated: "Нарахування створено",
  note_added: "Додано нотатку",
};
