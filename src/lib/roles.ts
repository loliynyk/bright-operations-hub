export type AppRole = "owner" | "director" | "administrator" | "teacher" | "accountant";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Власник",
  director: "Директор",
  administrator: "Адміністратор",
  teacher: "Вихователь",
  accountant: "Бухгалтер",
};

/** Placeholder — role-based visibility will be applied later. */
export function canSeeNav(_item: { roles?: AppRole[] }, _roles: AppRole[]): boolean {
  return true;
}
