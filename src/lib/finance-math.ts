// Pure helpers shared by charge lifecycle and UI.

export type DiscountRow = { type: "percentage" | "fixed"; value: number } | null;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function firstOfMonthISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonthsISO(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return firstOfMonthISO(d);
}

/**
 * Effective full-month amount:
 *   effective = max(0, (monthly_price - manual_discount) then apply discount).
 */
export function computeEffectiveMonthly(
  monthlyPrice: number,
  manualDiscount: number,
  discount: DiscountRow,
): number {
  let eff = Number(monthlyPrice || 0) - Number(manualDiscount || 0);
  if (discount) {
    if (discount.type === "percentage") eff = eff * (1 - Number(discount.value) / 100);
    else eff = eff - Number(discount.value);
  }
  return Math.max(0, round2(eff));
}

/**
 * Amount for a single period_month row, prorated for partial first/last month.
 * `periodMonthISO` must be first-of-month.
 */
export function computeMonthlyChargeAmount(args: {
  periodMonthISO: string;
  startDateISO: string;
  endDateISO: string | null;
  effectiveMonthly: number;
}): { amount: number; prorated: boolean } {
  const { periodMonthISO, startDateISO, endDateISO, effectiveMonthly } = args;
  const [py, pm] = periodMonthISO.split("-").map(Number);
  const dim = daysInMonth(py, pm - 1);
  const monthStart = new Date(py, pm - 1, 1);
  const monthEnd = new Date(py, pm - 1, dim);
  const start = new Date(startDateISO);
  const end = endDateISO ? new Date(endDateISO) : null;
  const from = start > monthStart ? start : monthStart;
  const to = end && end < monthEnd ? end : monthEnd;
  const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1);
  if (days >= dim) return { amount: effectiveMonthly, prorated: false };
  return { amount: round2((effectiveMonthly * days) / dim), prorated: true };
}

export function monthsBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const [sy, sm] = startISO.split("-").map(Number);
  const [ey, em] = endISO.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Billing horizon: end of the current quarter plus the next full quarter.
 * Returned as first-of-month ISO representing the LAST month included.
 */
export function endOfNextQuarterISO(from: Date = new Date()): string {
  const y = from.getFullYear();
  const q = Math.floor(from.getMonth() / 3); // 0..3
  // last month of "current quarter + next quarter" = month index q*3 + 5
  const targetMonth = q * 3 + 5;
  const d = new Date(y, targetMonth, 1);
  return firstOfMonthISO(d);
}
