// Shared constants and pure helpers for the admissions (Lead) workflow.
// UI labels are Ukrainian; codes match the database check constraints.

export const LEAD_STATUS_CATEGORIES = {
  open: "У роботі",
  converted: "Конвертовано",
  closed: "Закрито",
} as const;

export type LeadStatusCategory = keyof typeof LEAD_STATUS_CATEGORIES;

export const LEAD_CLOSE_REASONS = [
  { value: "price", label: "Ціна" },
  { value: "location", label: "Локація" },
  { value: "chose_other", label: "Обрали інший заклад" },
  { value: "format_conditions", label: "Формат / умови" },
  { value: "group_schedule", label: "Група або розклад" },
  { value: "changed_mind", label: "Передумали" },
  { value: "no_space", label: "Немає місць" },
  { value: "age", label: "Вік дитини" },
  { value: "needs", label: "Особливі потреби" },
  { value: "unreachable", label: "Не вдалося зв'язатися" },
  { value: "duplicate", label: "Дубль заявки" },
  { value: "other", label: "Інше" },
] as const;

export const LEAD_DOC_TYPES = [
  { value: "passport_book", label: "Паспорт (книжечка)" },
  { value: "id_card", label: "ID-картка" },
  { value: "international_passport", label: "Закордонний паспорт" },
  { value: "residence_permit", label: "Посвідка на проживання" },
  { value: "other", label: "Інший документ" },
] as const;

export const LEAD_CONTACT_CHANNELS = [
  { value: "call", label: "Дзвінок" },
  { value: "sms", label: "SMS" },
  { value: "messenger", label: "Месенджер" },
  { value: "email", label: "Email" },
  { value: "other", label: "Інше" },
] as const;

export const LEAD_CONTACT_OUTCOMES = [
  { value: "reached", label: "Додзвонились" },
  { value: "no_answer", label: "Не відповіли" },
  { value: "wrong_number", label: "Невірний номер" },
  { value: "declined", label: "Відмова" },
  { value: "other", label: "Інше" },
] as const;

export const PREFERRED_CHANNELS = [
  { value: "phone", label: "Телефон" },
  { value: "sms", label: "SMS" },
  { value: "messenger", label: "Месенджер" },
  { value: "email", label: "Email" },
] as const;

export const CHILD_GENDERS = [
  { value: "female", label: "Дівчинка" },
  { value: "male", label: "Хлопчик" },
  { value: "other", label: "Інше" },
] as const;

export const LEAD_CONTRACT_STATUSES = [
  { value: "draft", label: "Чернетка" },
  { value: "final", label: "Фінальний" },
] as const;

export function labelOf(list: readonly { value: string; label: string }[], v?: string | null) {
  if (!v) return "—";
  return list.find((x) => x.value === v)?.label ?? v;
}

/** Final agreed price = base minus discount, never below zero. */
export function computeFinalPrice(
  basePrice: number | null | undefined,
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
): number {
  const base = Number(basePrice ?? 0);
  const val = Number(discountValue ?? 0);
  if (!base) return 0;
  if (!val || !discountType) return round2(base);
  const off = discountType === "percentage" ? (base * val) / 100 : val;
  return round2(Math.max(0, base - off));
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const MAX_DISCOUNT_PERCENT_WITHOUT_APPROVAL = 0; // every discount needs approval

/** Client-side mirror of the server conversion requirements (for the readiness checklist). */
export function conversionChecklist(input: {
  lead: any;
  children: any[];
  contract: any | null;
}) {
  const { lead, children, contract } = input;
  const emailOk = !!lead?.parent_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.parent_email);
  const items = [
    { key: "name", label: "ПІБ представника", ok: !!lead?.parent_first_name?.trim() && !!lead?.parent_last_name?.trim() },
    { key: "phone", label: "Телефон представника", ok: !!lead?.parent_phone?.trim() },
    { key: "email", label: "Коректний email представника", ok: emailOk },
    { key: "branch", label: "Локація (філія)", ok: !!lead?.branch_id },
    { key: "children", label: "Щонайменше одна дитина", ok: (children?.length ?? 0) > 0 },
    {
      key: "child_fields",
      label: "ПІБ, дата народження та планована дата початку в кожної дитини",
      ok:
        (children?.length ?? 0) > 0 &&
        children.every(
          (c: any) => c.first_name?.trim() && c.last_name?.trim() && c.birth_date && c.planned_start_date,
        ),
    },
    {
      key: "tariff",
      label: "Тариф і фінальна ціна в кожної дитини",
      ok: (children?.length ?? 0) > 0 && children.every((c: any) => c.final_price !== null && c.final_price !== undefined),
    },
    {
      key: "discount_approval",
      label: "Знижки погоджені адміністратором",
      ok: (children ?? []).every((c: any) => !Number(c.discount_value) || !!c.approved_by),
    },
    { key: "contract", label: "Договір прикріплено", ok: !!contract },
    { key: "final", label: "Договір фіналізовано", ok: contract?.status === "final" },
    { key: "signed", label: "Зафіксовано дату підписання", ok: !!contract?.signed_date },
  ];
  return { items, ready: items.every((i) => i.ok) };
}
