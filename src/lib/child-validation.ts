// Shared validation for child names. Applied server-side wherever a
// Child row is created or updated (direct edits, lead conversion pre-flight).

const NAME_ALLOWED = /^[\p{L}\s'ʼ’\-]+$/u;
const HAS_LETTER = /\p{L}/u;

export function normalizeName(input: unknown): string {
  return typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
}

/** Throws in Ukrainian when the name is empty, punctuation-only, or contains
 *  characters that are not letters / spaces / apostrophes / hyphens. */
export function assertValidChildName(raw: unknown, field: "Ім'я" | "Прізвище" = "Ім'я"): string {
  const v = normalizeName(raw);
  if (!v) throw new Error(`${field} обов'язкове`);
  if (!HAS_LETTER.test(v)) throw new Error(`${field} має містити літери`);
  if (!NAME_ALLOWED.test(v)) throw new Error(`${field} містить недопустимі символи`);
  if (v.length > 80) throw new Error(`${field} задовге`);
  return v;
}

export function sanitizeOptionalName(raw: unknown): string | null {
  const v = normalizeName(raw);
  if (!v) return null;
  if (!HAS_LETTER.test(v) || !NAME_ALLOWED.test(v)) {
    throw new Error("Прізвище містить недопустимі символи");
  }
  return v.length > 80 ? v.slice(0, 80) : v;
}

export function assertValidBirthDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") throw new Error("Некоректна дата народження");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error("Некоректна дата народження");
  const year = d.getUTCFullYear();
  const now = new Date();
  if (year < 1990 || d.getTime() > now.getTime() + 86400000) {
    throw new Error("Дата народження поза допустимим діапазоном");
  }
  return raw;
}

export const CHILD_STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  paused: "Пауза",
  graduated: "Випущена",
  archived: "Архів",
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  confirmed: "Підтверджено",
  generated: "Згенеровано",
  sent: "Надіслано",
  signed: "Підписано",
  completed: "Завершено",
  cancelled: "Скасовано",
};

export function childStatusLabel(s?: string | null): string {
  if (!s) return "—";
  return CHILD_STATUS_LABELS[s] ?? s;
}

export function contractStatusLabel(s?: string | null): string {
  if (!s) return "—";
  return CONTRACT_STATUS_LABELS[s] ?? s;
}
