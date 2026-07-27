# Bright OS Prompt 006 — Core Settings & Setup Readiness

## Approach

All Administration pages are currently `PlaceholderPage` stubs. Replace them with real CRUD screens backed by server functions, keeping the existing design system (`PageHeader`, `SectionCard`, `DataTable`, `StatusBadge`, shadcn dialog/form). Introduce one shared settings pattern to avoid divergent UX.

No table redesign. Add only the minimum missing columns (e.g. `groups.capacity` already exists; `payment_methods.type`, `payment_methods.branch_id`, `discounts.valid_from/valid_to` if missing). All changes go into new migrations. RLS follows the existing `has_any_role` / `is_admin_or_manager` pattern.

## Migrations (new files only)

1. **006_settings_hardening.sql**
   - `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS type text`, `branch_id uuid REFERENCES branches`.
   - `ALTER TABLE discounts ADD COLUMN IF NOT EXISTS valid_from date, valid_to date`.
   - `ALTER TABLE groups ADD COLUMN IF NOT EXISTS age_from int, age_to int` (kept alongside existing `age_range` text).
   - `ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches` (nullable = global).
   - Partial unique index preventing overlapping active `price_versions` for a plan.
   - Guard trigger: block `UPDATE price_versions.monthly_price` when referenced by a `contracts` row with status in ('confirmed','signed','generated','sent').
   - Grants + role-gated RLS for any new columns (existing table-level RLS unchanged).

## Server functions (new / extended in `src/lib/settings.functions.ts`)

CRUD server fns per entity, all with `requireSupabaseAuth` + admin/manager check:
- `listGroups / upsertGroup / archiveGroup`
- `listServices / upsertService / archiveService`
- `listPlans / upsertPlan / archivePlan` + `listPrices / upsertPrice / archivePrice`
- `listDiscounts / upsertDiscount / archiveDiscount`
- `listPaymentMethods / upsertPaymentMethod / archivePaymentMethod`
- `listExpenseCategories / upsertExpenseCategory / archiveExpenseCategory`
- `getSetupReadiness(branchId)` → returns booleans + counts for each checklist item

Archive = flip `is_active=false`. Never hard-delete rows referenced by children/contracts/payments/expenses.

Extend `src/lib/lookups.functions.ts` to include `paymentMethods`, `expenseCategories`, `incomeCategories` (branch-filtered, active only).

## UI

Replace stubs with real pages using a shared internal `SettingsTable` component (`src/components/settings/settings-table.tsx`) rendering rows + edit/archive actions and a right-side sheet/dialog form:

- `admin.groups.tsx` — Groups per selected branch
- `admin.subscription-plans.tsx` — Plans list; row expands to Price Versions sub-table (unified experience)
- `admin.price-lists.tsx` — kept as read-only alias listing all price versions (compat)
- `admin.discounts.tsx`
- `admin.expense-categories.tsx`
- New `admin.payment-methods.tsx` route + nav entry "Методи оплати"
- New `admin.services.tsx` route + nav entry "Послуги"

Nav entries added to `src/lib/nav.ts` under Адміністрування.

### Overview setup checklist
Add `<SetupChecklist />` card at top of `routes/_authenticated/overview.tsx` (page itself remains PlaceholderPage-shaped; card is additive). Renders 6 items with ✓ / link to relevant `/admin/*` page. Dismiss button only enabled when all pass; dismissal stored in `localStorage` per branch.

### Empty-dropdown guidance
Add tiny `<EmptySelectHint to="/admin/…" label="…" />` helper. Wire into:
- Child group select (client detail)
- Contract Plan/Price/Discount/Service selects
- Payment method select in finance-tab payment form
- Expense category select in expenses page

No layout changes — hint renders inline below the select when its options list is empty.

## Files to add
- `supabase/migrations/…_settings_hardening.sql`
- `src/lib/settings.functions.ts`
- `src/components/settings/settings-table.tsx`
- `src/components/settings/empty-select-hint.tsx`
- `src/components/overview/setup-checklist.tsx`
- `src/routes/_authenticated/admin.payment-methods.tsx`
- `src/routes/_authenticated/admin.services.tsx`

## Files to modify (tightly scoped)
- `src/lib/nav.ts` — add 2 nav entries
- `src/lib/lookups.functions.ts` — extend
- `src/routes/_authenticated/admin.{groups,subscription-plans,price-lists,discounts,expense-categories}.tsx` — replace stub bodies
- `src/routes/_authenticated/overview.tsx` — mount checklist above placeholder
- `src/components/finance-tab.tsx` — empty-hint under payment-method select
- `src/routes/_authenticated/finance.expenses.tsx` — empty-hint under category select
- `src/routes/_authenticated/clients.$id.tsx` — empty hints under Plan/Price/Discount/Group/Service selects

## Verification
- `tsgo` typecheck
- Manually query DB counts through `getSetupReadiness`
- Confirm archived Group hidden from new Child assignment but visible on existing child rows
- Confirm price_version overlap guard blocks a duplicate overlapping insert
