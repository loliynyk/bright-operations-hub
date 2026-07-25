
# Bright OS — Finance Core & Діти

## 0. Conflicts / bugs in current implementation (fix first)

- **`payments.charge_id` is a single FK.** Blocks the "one payment → several months" and "one charge ← several payments" reality from the spreadsheets. Must be replaced by an allocations table before Payments UI is built.
- **`generateInitialCharges` hardcodes 3 months and is one-shot.** It ignores `end_date`, never extends when the contract runs longer, and has no path to react to commercial changes. Needs a real lifecycle service.
- **Discount recomputation is duplicated** (once in charge generator, and confirmation UI just stores `monthly_price`). Effective monthly amount must be a single pure function reused by charges, P&L projections, and PDF.
- **`groups` has no `capacity` column.** "Діти" needs it — new migration.
- **`charges.status` enum is `pending|paid|partial|cancelled`** but with allocations, status is derived (paid_amount vs amount, vs today for overdue). Keep the column but recompute it via trigger from allocations — never set from UI.
- **`period_month` is `date` with day component free-form.** Standardize to the 1st of month (already the case in code, add a CHECK/normalization trigger).
- **`generateContractPdf` sets `status='generated'` after confirmation.** This overwrites `confirmed`, losing the confirmation signal. PDF generation should not mutate contract status.
- **No `paid_at` index / no `spent_at` index on expenses.** Cash Flow / P&L will need them.
- **Charges page, Payments page, Cash Flow, P&L, Expenses, Діти are placeholders.** No UI to replace.

## 1. Domain model (new + changed)

Keep existing tables. Add/adjust:

### Changes to existing

- `groups`: add `capacity int` (nullable, admin-editable in Адміністрування → Групи later; edit UI out of scope this phase, migration only).
- `charges`: add `due_date date not null` (default = `period_month`), `paid_amount numeric not null default 0`, keep `status` but drive it from a trigger: `paid` when `paid_amount >= amount`, `partial` when `0 < paid_amount < amount`, `overdue` (new enum value) when `pending` and `due_date < today`, else `pending`. `cancelled` stays manual.
- `payments`: drop `charge_id` (data-migrate to allocations first: for every existing payment with a charge_id, create one allocation row). Add `status` (`posted|void`), keep `payment_method_id`, `paid_at`, `amount`, `note`.
- `contracts`: add `recalc_locked boolean default false` (admin escape hatch); PDF generation must not touch `status`.

### New tables

```text
payment_allocations
  id uuid pk
  payment_id uuid → payments(id) on delete cascade
  charge_id  uuid → charges(id)   on delete restrict
  amount numeric > 0
  created_at, created_by
  unique(payment_id, charge_id)

income_categories        -- lookup, for P&L revenue grouping
  id, name, is_active
contracts.income_category_id (nullable, defaults from service)
services.income_category_id (nullable)

charge_adjustments       -- audit trail for any change to a historical/paid charge
  id, charge_id, old_amount, new_amount, reason text, actor_id, created_at

client_credits           -- overpayment ledger (see §3)
  id, client_id, branch_id, source_payment_id, amount_remaining numeric, created_at
```

Triggers:
- `charges` `paid_amount` auto-updated from `sum(payment_allocations.amount)` on insert/update/delete of allocations.
- `charges.status` recomputed in same trigger.
- Prevent `UPDATE` of `charges.amount` when `paid_amount > 0` unless caller sets a session GUC / calls a `SECURITY DEFINER` `adjust_charge(charge_id, new_amount, reason)` that writes to `charge_adjustments`.

## 2. Charge lifecycle & safe recalculation

Single server function `recalcContractCharges(contractId)` — the ONLY writer of future charges.

Rules:
1. Compute canonical months = every 1st-of-month from `start_date` to `min(end_date, start_date + 12 months rolling window)`; short contracts stop at `end_date`. Rolling window: keep at least the next 3 unpaid months materialized; generate more when the admin opens the client card and the window has advanced (lazy top-up on read).
2. For each month determine `expected_amount` via `computeMonthlyAmount(contract)` (pure function: `monthly_price − manual_discount − discount(percentage|fixed)`, prorate month 1 by remaining days, prorate last month if `end_date` before month end).
3. For each month:
   - If no charge row → INSERT `pending`.
   - If charge exists and `paid_amount = 0` and status ∈ {pending, overdue} → UPDATE amount / prorate / due_date in place.
   - If `paid_amount > 0` OR `status ∈ {paid, partial, cancelled}` → **DO NOT touch**. If `expected_amount ≠ current amount`, emit a `charge_drift` timeline event with old/new so admin sees the discrepancy and can decide (manual adjust via `adjust_charge`).
4. If contract ends earlier than existing future rows → cancel (not delete) untouched `pending` rows beyond `end_date` with `status='cancelled'`, reason logged.
5. Called automatically from `confirmContract` (creates first months), and from `updateContract` when it succeeds AND contract is not `draft` AND `recalc_locked=false`.
6. Idempotent: safe to call repeatedly. Uses existing `unique(contract_id, period_month)`.

Historical/paid periods are NEVER silently rewritten — only `adjust_charge` (explicit admin action, audit row) can change them.

## 3. Payments & allocations rules

Payment form fields: client, paid_at, amount, payment_method, note, optional pre-selected charge(s).

Allocation algorithm on save (`recordPayment`):
1. Insert payment row (status `posted`).
2. Load client's open charges (`pending|partial|overdue`) ordered by `period_month asc`.
3. If admin provided explicit allocations → use them (validate `sum ≤ payment.amount`, each ≤ charge remaining).
4. Otherwise auto-allocate FIFO: walk charges, allocate `min(charge.remaining, payment_remaining)` until payment consumed.
5. If payment has remaining amount after all open charges consumed → insert `client_credits` row with `amount_remaining`.
6. Trigger recomputes affected charges' `paid_amount`/`status`.

Applying a credit: dedicated action "Використати переплату" creates a synthetic payment referencing `source_payment_id`, allocations against selected charges, decrements `client_credits.amount_remaining`.

Void payment: reverses allocations, restores charge status, decrements credits (blocked if credit already spent — admin must first free the downstream allocation).

Partial payments: allowed by construction — allocation < charge.amount leaves `status='partial'`.

## 4. Information architecture

### 4.1 Client card — "Фінанси" tab (replaces empty placeholder)

Sections:
- **KPI row**: Нараховано (сумарно), Оплачено, Борг, Переплата, Наступне нарахування (дата+сума).
- **Charges table**: period_month, amount, paid_amount, remaining, status pill (Очікує/Прострочено/Частково/Оплачено/Скасовано), actions (Додати оплату, Скоригувати, Скасувати).
- **Payments table**: paid_at, amount, method, allocated_to (list of periods), note, actions (Void).
- **Credits panel**: list of open переплати with "Застосувати".
- Recalc button: "Перерахувати нарахування" (calls `recalcContractCharges`, shows drift warnings).

### 4.2 Клієнти → Діти (new page `/clients/groups` becomes real; rename NAV to "Діти")

Layout: one collapsible section per Group in current branch. Header shows: Group name, age range, active/capacity ("18/22"), доступно (4), заплановано прийти (2), йдуть (1).

Rows per child: child name, батько/мати (link to client), start_date, end_date, contract status pill, monthly_price (effective), поточний борг. Row action: → client card.

Filters: філія (from branch context), пошук, "Показати архів". "Без групи" section at bottom for active children without group.

### 4.3 Finance nav (revised)

Remove Договори and Витрати duplicates from top-level Finance — Договори lives on client card, Витрати keeps its page but under a subsection. Final order:

- Нарахування (`/finance/charges`)
- Платежі (`/finance/payments`)
- Дебіторка (`/finance/receivables`) — NEW
- Витрати (`/finance/expenses`)
- Cash Flow (`/finance/cash-flow`)
- P&L (`/finance/pnl`)

Договори залишається доступним лише з картки клієнта (лінк у топ-барі) — не в меню, щоб не було двох джерел правди.

### 4.4 Нарахування page

KPI: Всього за період, Оплачено, До сплати, Прострочено.
Filters: branch, period (month picker range), status, group, service.
Table: period_month, client, child, group, amount, paid, remaining, status, due_date, actions (додати оплату, скоригувати).
Bulk actions: експорт CSV.

### 4.5 Платежі page

KPI: Всього за період, Кількість платежів, Середній чек, Нерозподілено (credits створені за період).
Filters: branch, period (paid_at), method, client search.
Table: paid_at, client, amount, method, allocated periods, note, actions.

### 4.6 Дебіторка page

KPI: Загальний борг, Прострочено (>0 днів), 1–30 днів, 31–60, 61+.
Table: client, child, group, oldest_overdue_month, months_overdue, total_debt, last_payment_at, actions (нагадати — заглушка, додати оплату).
Filters: branch, group, min_debt, aging bucket.

### 4.7 Cash Flow page

Actual cash by `paid_at` (inflows: payments.amount) and `spent_at` (outflows: expenses.amount).
Filters: branch, period, payment_method, category (expenses), inflow/outflow toggle.
KPI: Початковий баланс, Надходження, Витрати, Кінцевий баланс. Opening balance = cumulative (payments − expenses) before period start, per branch × method.
Views: (1) daily table, (2) monthly summary, (3) breakdown by method and category.
Excludes: unpaid charges, accruals — pure cash.

### 4.8 P&L page

Operating performance by month × branch.
Revenue = `payments` grouped by `contract.income_category_id` (fallback service name) — matches the current income sheet ("cash-basis revenue"). Explicit label "Дохід (касовий метод)" so it's not confused with charges.
Operating expenses = `expenses` grouped by category.
Rows: Дохід (за категоріями), Разом дохід, Операційні витрати (за категоріями), Разом витрати, Операційний результат, Чистий результат (для v1 = операційний, поки немає податків/амортизації).
Filters: branch, period (month range), compare-to-previous toggle.
Not shown here: unpaid charges, forecast — those belong on Дебіторка / Нарахування.

## 5. UI prototype (text)

```text
/clients/groups  →  Діти
┌─ KPI: Активних дітей 42 · Група-місць 60 · Заповненість 70% ─┐
[Філія: Bright 319 ▾] [Пошук] [☐ Показати архів]

▼ Група "Совенята"  (3–4 роки) · 18/22 · доступно 4 · +2 приходять · −1 йде
  Дитина           Клієнт          Початок    Кінець   Договір     Ціна   Борг
  Марія П.         Ірина П.        01.09.25   —        Активний    9 500  0
  Артем К.         Олег К.         15.09.25   —        Чернетка    9 500  —
  ...
▶ Група "Ведмежата" 12/16
▶ Без групи (3)
```

```text
/clients/:id  → Tab "Фінанси"
┌ Нараховано 47 500 · Оплачено 38 000 · Борг 9 500 · Переплата 0 ┐
Наступне нарахування: 01.02.2026 — 9 500 ₴

Нарахування
Період     Сума    Оплачено  Залишок  Статус         Дії
01.10.25   4 750   4 750     0        Оплачено       [Скоригувати]
01.11.25   9 500   9 500     0        Оплачено
01.12.25   9 500   9 500     0        Оплачено
01.01.26   9 500   0         9 500    Прострочено    [+ Оплата] [Скасувати]

Платежі
Дата         Сума    Метод   Розподілено                 Дія
10.10.25    14 250   Готівка 10-2025 (4 750) + 11-2025 (9 500)   [Void]
...

Переплата: —
[Перерахувати нарахування]
```

## 6. Phased implementation & acceptance

**Phase A — DB foundation (migration only)**
- Add `groups.capacity`, `charges.due_date`, `charges.paid_amount`, `charge_status` enum value `overdue`, `contracts.recalc_locked`, `payments.status`, `income_categories`, `contracts.income_category_id`, `services.income_category_id`, `charge_adjustments`, `client_credits`, `payment_allocations`.
- Data-migrate existing `payments.charge_id` → allocations, then drop column.
- Add triggers: allocations → charges.paid_amount+status; block `charges.amount` update when paid without `adjust_charge`.
- Grants + RLS (staff via `has_any_role`, config writes via `is_admin_or_manager`).
- Fix `generateContractPdf` to not overwrite `status`.
- **Accept**: migration applies; existing payments visible as allocations; charges statuses recompute correctly on fixture.

**Phase B — Charge lifecycle**
- `computeMonthlyAmount` pure helper (server + shared).
- `recalcContractCharges` server fn.
- Wire from `confirmContract` and `updateContract`.
- Drift timeline event when historical amount would change.
- **Accept**: change `monthly_price` on confirmed contract → future unpaid charges update, paid ones untouched, drift event logged. Set `end_date` earlier → future charges cancelled. Extend `end_date` → new pending charges appear.

**Phase C — Payments + allocations**
- `recordPayment`, `voidPayment`, `applyCredit`, `adjustCharge` server fns.
- Client card "Фінанси" tab (KPIs, charges table, payments table, credits).
- **Accept**: overpayment creates credit; splitting one payment across two months works; void reverses charges' status; partial payment leaves `partial`.

**Phase D — Діти + nav rename**
- Migration for `groups.capacity` already in Phase A. UI page implementing §4.2.
- NAV: rename "Групи" child → "Діти". Reorganize Finance children per §4.3.
- **Accept**: page shows groups grouped, KPIs correct, links open client card.

**Phase E — Нарахування, Платежі, Дебіторка pages**
- Real list pages with filters + KPIs from §4.4–4.6.
- **Accept**: aging buckets match hand calc on seed data.

**Phase F — Cash Flow + P&L**
- Server aggregations by month × branch; opening balance calc for Cash Flow.
- **Accept**: Cash Flow closing_balance(period n) == opening_balance(period n+1); P&L revenue equals sum of payments.amount in period (не charges).

## 7. Open questions / assumptions

- Assumed one contract active per child at a time; if a child can have overlapping contracts (e.g. add-on service), the recalc scope needs `child_id` filtering — please confirm.
- Assumed cash-basis revenue for v1 P&L per your rule; accrual P&L (charges) can be added later as a toggle.
- Discount stacking order assumed: `(monthly_price − manual_discount)` then percentage/fixed discount applied. Confirm if opposite order is used in current sheets.
- `capacity` per group will be editable later in Адміністрування → Групи (out of scope this phase, only column + Діти display added now).
