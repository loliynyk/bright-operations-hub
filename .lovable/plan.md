## Ticket A — Configurable Lead statuses (admin-managed)

### Current state (verified)
- `public.lead_status` enum drives `leads.status`; values in use: `archived, contacted, contract, converted, lost, new, waiting` (plus enum-only unused ones).
- UI constants: `src/lib/leads.ts` (`LEAD_STATUSES` — value/label/tone), consumed by:
  - `src/routes/_authenticated/leads.index.tsx` (filter, inline status select, funnel)
  - `src/routes/_authenticated/leads.$id.tsx` (badge, status dropdown)
  - `src/components/leads/leads-funnel.tsx` (`FUNNEL_STAGES` groups)
  - `src/components/overview/dashboard.tsx` (labels only)
- `convert_lead_to_client` RPC sets `status='converted'` (system-protected).
- Admin routes follow the `SettingsShell` + `listX/upsertX/archiveX` pattern (see `admin.expense-categories.tsx`, `src/lib/settings.functions.ts`). `admin.lead-sources.tsx` is currently a placeholder — reuse that slot's neighborhood but add a new route for statuses.
- Nav is registered in `src/lib/nav.ts` under "Адміністрування".

### Design — smallest safe schema

New table `public.lead_statuses`:
- `id uuid pk`
- `code text unique not null` — stable machine code (e.g. `new`, `converted`, `custom_xyz`)
- `label text not null` — Ukrainian display
- `tone text not null default 'bg-muted text-foreground'` — badge class
- `sort_order int not null default 100`
- `is_active boolean not null default true` — assignable to new/changed leads
- `is_system boolean not null default false` — cannot be deleted/renamed-code; label/tone/order editable
- standard `created_at/updated_at` with trigger

Seed with all 12 current enum values, mapping labels/tones from `src/lib/leads.ts`. Mark as `is_system=true`: `new`, `converted` (required by RPC), `archived`, `lost` (terminal). Others start as regular (editable+deletable when unused).

RLS/GRANTS:
- `GRANT SELECT` to authenticated (needed on every page).
- `GRANT INSERT/UPDATE/DELETE` to authenticated gated by `has_role('admin')` OR `has_role('manager')` in policies (mirroring existing settings tables).
- `service_role` full.

Keep `leads.status` typed as the existing `lead_status` enum for now — no destructive enum migration. `code` in `lead_statuses` matches enum values. To allow future custom statuses beyond the enum, add a follow-up (out of scope): switch column to `text` + FK; **not** part of this ticket to preserve data safety. Ticket only adds admin-editable **label/tone/order/is_active** for the existing codes — no new custom codes yet. This satisfies "authorized users can adjust them" without touching the enum or 396 rows.

### Migration for 396 existing records
Zero-touch: enum stays, `leads.status` unchanged. Just insert 12 seed rows into `lead_statuses` matching current enum values. Historical leads with inactive statuses remain readable (SELECT everything) and filterable (funnel/filter show all statuses that appear in data OR that are active).

### System protection rules (server + UI)
- `upsertLeadStatus` server fn: if `row.is_system`, forbid changing `code` and `is_active=false` for `new`/`converted` (needed by intake and RPC). Allow label/tone/sort_order.
- `deleteLeadStatus`: forbidden if `is_system=true` OR any lead currently references the code.
- Client-side `updateLeadStatus`/inline select: assignable options = `is_active=true`. Historical rows display resolved label/tone regardless of active flag.
- `convert_lead_to_client` untouched — still writes `'converted'`, which is a protected seed.

### UI changes
1. `src/lib/settings.functions.ts`: add `listLeadStatuses`, `upsertLeadStatus`, `deleteLeadStatus` (all require admin/manager for mutations; list open to authenticated).
2. New route `src/routes/_authenticated/admin.lead-statuses.tsx` using `SettingsShell`, columns: Назва, Код (readonly), Порядок, Активний, Системний. Form fields: label, tone (predefined swatches from existing palette), sort_order, is_active. Delete disabled for system/in-use.
3. `src/lib/nav.ts`: add `{ to: "/admin/lead-statuses", label: "Статуси лідів" }` under Адміністрування, near "Джерела лідів".
4. Replace static `LEAD_STATUSES` reads with a shared hook `useLeadStatuses()` (React Query, cached, invalidated by admin mutations) used by:
   - Leads index (filter, inline select — inline select filters by `is_active`, filter dropdown shows all with active first).
   - Lead detail (status dropdown — same rule).
   - Funnel: keep `FUNNEL_STAGES` groupings hard-coded (grouping is a product concept, not per-status editable), but resolve labels/tones from the hook so admin renames propagate.
   - Overview dashboard `statusLabel` calls: replace with hook-based resolver (fallback to code if not loaded).
5. Keep `src/lib/leads.ts` `LEAD_STATUSES` as a **fallback constant** used only if the hook has no data (SSR/first paint) — remove from active call sites.

### Notes
- Removing `LEAD_STATUSES` from primary imports narrowly; not touching sources or contract statuses (out of scope).
- Optional/future: allow custom codes beyond enum — explicitly deferred.

---

## Ticket B — "Видалити" permanently deletes lead

### Current state (verified)
- `src/routes/_authenticated/leads.index.tsx` row action is labeled "Перевести в архів" and calls `saveLead({status:'archived'})`; `ConfirmDeleteDialog` uses `variant="archive"`.
- FKs are safe for hard delete: `clients.lead_id ON DELETE SET NULL`, `leads.converted_client_id SET NULL` (self, N/A), `timeline_events.lead_id ON DELETE CASCADE`, `lead_intake_events.lead_id SET NULL`. No blocking references.
- RLS: DELETE policy exists for authenticated staff.

### Change
1. Add `deleteLead(id)` server fn in `src/lib/leads.functions.ts` — auth-required, single `.delete().eq('id', id)`, returns `{ok:true}`. No status coercion.
2. In `leads.index.tsx`:
   - Rename action label to "Видалити" with `Trash2` icon (destructive).
   - Rename local state `archiving` → `deleting`.
   - Replace mutation body with `deleteFn({data:{id}})`.
   - `ConfirmDeleteDialog` → `variant="delete"`, impact copy: "Ліда буде видалено назавжди. Пов'язаний клієнт (якщо є) залишиться, але посилання на лід буде очищено. Історія таймлайну видалиться разом з лідом." Toast: "Ліда видалено".
   - Invalidate `["leads", branch.id]` and `["overview", branch.id]`.
3. Keep archived-status semantics intact (still a valid status via Ticket A) — the archive action itself is removed from the row menu; users who want soft-archive use the status dropdown.

### Disposable verification
- Insert one QA lead via UI ("QA — DELETE ME", branch = current test branch, status `new`).
- Trigger row action → confirm → verify row disappears, `select count(*)` matches, and timeline row for that lead is gone. Screenshot both.
- Do NOT touch any of the 396 production records.

---

## Files touched
- `supabase migration`: create `lead_statuses`, grants, RLS, seed (12 rows).
- `src/lib/settings.functions.ts`: +3 fns.
- `src/lib/leads.functions.ts`: +`deleteLead`.
- `src/lib/leads.ts`: mark LEAD_STATUSES as fallback (keep exports).
- `src/lib/hooks/use-lead-statuses.ts` (new): shared resolver hook.
- `src/routes/_authenticated/admin.lead-statuses.tsx` (new).
- `src/lib/nav.ts`: +nav entry.
- `src/routes/_authenticated/leads.index.tsx`: swap archive→delete; use hook.
- `src/routes/_authenticated/leads.$id.tsx`: use hook.
- `src/components/leads/leads-funnel.tsx`: resolve labels/tones via hook.
- `src/components/overview/dashboard.tsx`: use hook resolver.

## Verification
- `bunx tsgo --noEmit` + prod build.
- Playwright: open Leads page → verify status dropdowns render seeded labels; open `/admin/lead-statuses` → rename one label → confirm it appears in Leads filter/inline. Create QA lead → delete via row action → confirm removal and cache refresh. Restore renamed label.
- SQL sanity: `select count(*) from leads;` before/after equals 396 (+/- the QA lead which is inserted then deleted).