
# Finance refactor — implementation plan

## 1. Business rules locked in
- **Prorating** switches from calendar days to **working days (Mon–Fri)**. Formula: `charge = effective_monthly × active_weekdays_in_period / total_weekdays_in_month`, rounded to 2 decimals.
- **Price changes always start on the 1st of a chosen month.** No mid-month price events.
- **Past charges never silently change.** Paid/partial charges are frozen; historical corrections go through `charge_adjustments`. Only future unpaid charges from the effective month may be recalculated.
- **Idempotent generation**: (client_id, contract_id, period_month) already unique on `charges` — we add a stricter DB constraint and re-use it.

## 2. Database changes (single new migration)
- Add SQL helpers:
  - `weekdays_in_month(period date) → int`
  - `weekdays_between(from date, to date) → int` (inclusive, Mon–Fri only)
- Rewrite `generate_charges_for_contract(_contract_id, _through_month)` (idempotent):
  - Insert missing months from `start_date`'s month up to a target month (default: start month + 2).
  - First and last month use working-day prorating; middle months use full `effective_monthly`.
  - `ON CONFLICT (contract_id, period_month) DO NOTHING`.
  - Recomputes status via existing `recompute_charge_status`.
- Add `extend_contract_charges(_contract_id, _through_month)` — same insert, but callable per contract to extend the horizon.
- Add `recalc_future_unpaid_charges(_contract_id, _from_month)` — updates `amount` on future charges where `status IN ('pending','overdue')` AND `paid_amount = 0`, using current pricing snapshot; skips paid/partial; records timeline event.
- Add `apply_price_change(_scope jsonb, _effective_month date, _new_monthly_price numeric)` — server-side bulk apply:
  - Scope filters: `branch_id`, `group_id`, `service_id`, `client_id[]`.
  - Effective month is snapped to first-of-month (enforced).
  - Updates `contracts.monthly_price` (going-forward reference) and calls `recalc_future_unpaid_charges` for each affected contract starting from `_effective_month`.
- Add unique index `charges_unique_period_per_contract` (contract_id, period_month) if not already present (verify first).
- **No destructive changes**: existing charges, payments, allocations, credits are untouched. Existing calendar-day prorated historical rows remain as-is.

## 3. Server functions (`src/lib/finance.functions.ts`)
- `generateInitial3Months({ contract_id })` — thin wrapper on RPC.
- `extendChargeHorizon({ contract_id, through_month })`.
- `applyPriceChange({ effective_month, new_monthly_price, scope })`.
- `recalcFutureCharges({ contract_id, from_month })`.
- `listInvoices({ branch_id, from, to, status, group_id, service_id, search })` — enriched rows with base_price, discount_applied, prorate_delta, manual_adjustment, final_amount, breakdown.
- `listClientBalances({ branch_id, group_id, search, status })` — one row per client with live balance (Σ charges – Σ allocations, credits netted).
- `getClientMonthlyLedger({ client_id, months })` — array of { month, charge, paid, remaining, status, payments[], allocations[] } for expandable rows.
- Keep existing `recordPayment` (already supports partial), `voidPayment`.

## 4. Routes / UI
- **New**: `src/routes/_authenticated/finance.invoices.tsx` (Нарахування) — replaces charges page:
  - Filters: branch (from global), group, service, month, status, search.
  - Toolbar actions: **Сформувати нарахування на 3 місяці** (per client picker), **Зміна ціни з місяця** (opens dialog with effective month + scope + new price), **Ручна корекція** (per row), **Скасувати нарахування**.
  - Table columns: №, клієнт, дитина, група, місяць, базова ціна, знижка, пропорція, ручна корекція, фінальна сума, статус.
  - Expandable row → calculation breakdown (working days used, monthly rate, discount math, adjustments).
- **Rewrite**: `src/routes/_authenticated/finance.payments.tsx` (Оплати) — one numbered row per client with live balance:
  - Columns: №, клієнт, діти, група, баланс (До сплати / Переплата / Сплачено), розгорнути.
  - Expanded: default 3-month rolling window (current, -1, -2). "Показати всю історію" reveals full ledger inline.
  - Each month row: місяць, нарахування, сплачено, залишок, статус, "Додати оплату".
  - Payment modal: amount (defaults to remaining, editable smaller), paid_at, method, reference (external_ref), note; header shows charge / already paid / remaining. Uses existing `post_payment` allocations.
  - Filters: search, status, group, branch, month/date presets (цей місяць, попередній, наступний, свій місяць, діапазон, вся історія).
- **Remove from finance nav**: settlements, receivables, charges (old page). Keep Витрати, Cash Flow, P&L untouched. Update `src/lib/nav.ts` + `src/components/sidebar-nav.tsx`.
- **Client Finance tab** (`src/components/finance-tab.tsx`): keep, but pull from the same central RPCs (no schema duplication). Minor update to align terminology.

## 5. Prorating helper (`src/lib/finance-math.ts`)
- Replace calendar-day formula in `computeMonthlyChargeAmount` with weekday-based one. Keep signature. Export `weekdaysInMonth`, `weekdaysBetween` for UI breakdowns.
- **UI-only** switch — persistence for future charges happens through the new SQL helpers, keeping DB and UI aligned.

## 6. Data safety
- No UPDATE/DELETE on existing rows during migration.
- `apply_price_change` and `recalc_future_unpaid_charges` explicitly filter `paid_amount = 0 AND status IN ('pending','overdue')`. Paid/partial rows are never touched — corrections require an adjustment entry.
- Idempotent `generate_charges_for_contract` prevents duplicates. Unique index enforces it at DB level.
- Existing `[IMPORT 2026-06]` data preserved.

## 7. Validation checklist (post-deploy)
1. Existing finance data loads (Нарахування + Оплати render without empty state).
2. Re-running "Сформувати на 3 місяці" for a client with existing charges creates zero duplicates.
3. Add two partial payments to one month → balance updates immediately; status flips to partial then paid.
4. Newly activated client with mid-month start_date → month 1 = weekday-prorated; months 2 & 3 = full price.
5. Price change dialog with effective month = next month + scope=branch → only future unpaid charges from that month update; paid ones untouched.
6. Working-day math: e.g., Feb 2026 has 20 weekdays; start on 2026-02-11 → 15 remaining weekdays → 15/20 × final.
7. Ledger window auto-shifts on new month (verified via mocked "today" query param or by inspecting month-index logic).

## 8. Out of scope for this ticket
- Client-record "finance settings" form redesign (billing status field, due-day field) — schema already carries `contracts.start_date` / `monthly_price` / `discount_id` / `manual_discount`, so we drive from contracts and defer a separate settings form.
- Adjustment as a separate "adjustment charge" row (kept in `charge_adjustments` audit table; UI shows adjustments inline in the breakdown).
- Automated month-rollover scheduler (existing manual "extend" action stays).

## 9. Deliverable
- 1 migration (helpers + RPC + unique index).
- Updated `finance.functions.ts`, `finance-math.ts`.
- New `finance.invoices.tsx`, rewritten `finance.payments.tsx`.
- Removed/hidden routes: charges, settlements, receivables.
- Updated nav.
- Concise report: migrated counts, schema deltas, validation results.

Reply "go" to implement, or note any changes (e.g. keep receivables page hidden vs deleted, differ on adjustment UX).
