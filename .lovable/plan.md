# Bright OS — Usability Layer

Scope is very large. To ship safely, this pass introduces the shared primitives and applies them consistently across every list, then refactors Business Overview into a real dashboard. No production data is mutated.

## Shared primitives (new files)

- `src/components/ds/list-toolbar.tsx` — `ListToolbar`, `FilterBar`, `ActiveFilterChips` (reset + visible active state).
- `src/components/ds/kpi-grid.tsx` — `KpiGrid` wrapping `MetricCard` with responsive 3–5 column layout.
- `src/components/ds/clickable-row.tsx` — helper: `onRowClick(id, navigate)` + `stopRow` helper; `role=button`, `tabIndex=0`, Enter/Space handlers. Extend `DataTable` with optional `onRowClick`/`rowHref` so entire row is clickable, keyboard-focusable, and hover styled; internal actions call `e.stopPropagation()`.
- `src/components/ds/inline-status-select.tsx` — compact popover Select with optimistic update, toast, rollback.
- `src/components/ds/row-actions-menu.tsx` — `MoreHorizontal` dropdown ("Відкрити", edit, delete/archive), stops propagation.
- `src/components/ds/confirm-delete-dialog.tsx` — named entity + impact copy + "Видалити"/"Архівувати" variants.

## Server functions

Add small, safe update fns only where missing (reuse existing where possible):
- `updateLeadStatus`, `assignLead`
- `updateClientStatus`, `assignClientGroup` (via child? — clients don't own group; skip if not modelled)
- `assignChildGroup`, `setChildStatus` (route through existing `saveChild`/lifecycle RPCs; do NOT bypass departure RPC)
- `setEmployeeActive`, `setGroupActive`, `setServiceActive`, `setDiscountActive`, `setPaymentMethodActive`, `setExpenseCategoryActive`, `setBranchActive`
- Delete/archive: reuse existing archive server fns; add soft-archive where missing (branches, employees). Finance charges/payments: void/cancel only via existing RPCs, no hard delete.

## Per-list application

For each list add: FilterBar (real fields only), 3–5 KpiGrid tiles, clickable rows → detail route, RowActionsMenu (Open/Edit/Archive with ConfirmDeleteDialog), inline edits per list.

| Page | Filters | KPIs | Inline edits | Destructive |
|---|---|---|---|---|
| Leads | search, status, source, assigned, desired_start month | open, new this month, trial scheduled, converted, lost | status, assignee | archive (soft) |
| Clients | search, status | active clients, active children, contracts ending 30d, outstanding | status | archive |
| Children | search, status, group, birth-year | active, without group, birthdays this month, leaving 30d | group, lifecycle→RPC | complete attendance (RPC) |
| Employees | search, active, branch, position | active, per-branch | active toggle | deactivate |
| Groups | active, age band | count, enrolled, available places, full | active | archive |
| Services | active | active count | active | archive |
| Discounts / Payment methods / Expense categories / Income cats | active, branch | count active | active | archive |
| Branches | active | count | active | archive |
| Users / Roles | search, role | — | role (existing) | remove role |
| Finance Invoices | period, status, group, client search | charged, paid, outstanding, overdue | — | cancel charge (existing) |
| Finance Payments | month window, client | current-month paid, outstanding | — | void (RPC) |
| Expenses | period, category, branch | total this month, by category top | — | delete (owner) |

Finance monetary/calculated fields remain read-only.

## Business Overview dashboard (`overview.tsx` + `src/components/overview/*`)

Setup completion = all `getSetupReadiness` items true. While incomplete → keep `SetupChecklist`. When complete → render `<Dashboard>`; keep a collapsed "Показати прогрес налаштування" link.

Dashboard sections (branch-scoped, real data via new `getOverviewDashboard` server fn — one round-trip, aggregating):
- KPIs: active clients, active children, open leads, month charged, month paid, outstanding.
- Insights: leads-by-stage bar; new vs converted this month; group occupancy list (name, filled/capacity, progress bar); contracts starting 14d; contracts ending 30d; clients with outstanding (top 5).
- Recent activity: 5 latest leads / clients / payments / timeline events.
- Quick actions: Add lead, Onboard client, Open Finance, Manage groups (Link buttons).

Composed of small components under `src/components/overview/dashboard/` using existing `MetricCard`, `SectionCard`, `StatusBadge`, `Progress`. No new charting lib.

## Interaction & safety rules

- `DataTable` extension: rows get `cursor-pointer hover:bg-muted/40 focus:ring-2` when navigable; internal interactive descendants (`button, a, [role="menuitem"], input, select, [data-stop]`) already stop propagation via delegated handler.
- Optimistic inline edits: mutate → toast → invalidate queryKey; on error revert + `toast.error`.
- Confirm dialogs list dependency counts where cheap (e.g. children in group). Block delete when unsafe with helpful message.
- Respect existing RLS; hide destructive actions when `has_role` check unavailable (default to admin/manager gate already used).
- Keep all queries `branch.id`-scoped. No new N+1 loops.

## Validation

- `tsgo` typecheck.
- Playwright smoke: Overview, Leads, Clients, Children, Employees, Groups, Services, Finance settlements, Admin branches. Verify row click navigates, action menu stops propagation, confirm dialog opens (cancel), one inline status change on a reversible QA record only if one exists — otherwise open the popover and cancel.

## Out of scope this pass

- New charting library.
- Refactoring existing finance RPCs.
- Any migration touching production rows.
