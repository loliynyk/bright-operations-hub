## Bright OS — Prompt 002: Admissions Engine

Extend the existing app (no redesign, no nav changes) with the full Lead → Client → Contract workflow, PDF generation, first quarter Charges, timeline, and global search.

### 1. Database (single migration)

New enums:
- `client_status`: `active`, `paused`, `archived`
- `child_status`: `active`, `paused`, `graduated`, `archived`
- `contract_status`: `draft`, `generated`, `sent`, `signed`, `cancelled`, `completed`
- `discount_type`: `percentage`, `fixed`
- `charge_status`: `pending`, `paid`, `partial`, `cancelled`
- `timeline_event_type`: `lead_created`, `status_changed`, `client_created`, `contract_generated`, `pdf_generated`, `charges_generated`, `note_added`

Extend `lead_status` enum with new UA-aligned values (kept English keys): `new`, `contacted`, `waiting`, `trial`, `contract`, `converted`, `lost`, `archived`. Migrate existing rows.

Extend `leads`:
- `service_id uuid`, `source_form text`, `registration_date date`
- `parent_first_name`, `parent_last_name`, `parent_address`
- `child_first_name`, `child_last_name`, `desired_start_date date`
- `trial_date timestamptz`, `converted_client_id uuid`
(Keep legacy `parent_name`, `child_name`, `child_birthdate` for back-compat.)

New tables (all branch-scoped, RLS + GRANTs):
- `services` (branch_id, name, is_active)
- `subscription_plans` (branch_id, name, description, is_active)
- `price_versions` (plan_id, name, monthly_price numeric, valid_from date, valid_to date)
- `discounts` (branch_id, name, type discount_type, value numeric, is_active)
- `clients` (branch_id, lead_id, parent_first_name, last_name, phone, email, address, notes, status client_status, service_id)
- `children` (client_id, branch_id, first_name, last_name, birth_date, group_id nullable, status child_status, start_date, end_date)
- `contracts` (branch_id, client_id, child_id, number text unique, service_id, plan_id, price_version_id, discount_id, manual_discount numeric, monthly_price numeric, start_date, end_date, status, comment, pdf_url)
- `charges` (branch_id, client_id, contract_id, period_month date, amount numeric, status charge_status, is_prorated bool)
- `client_attachments` (client_id, branch_id, name, url, mime, size)
- `timeline_events` (branch_id, lead_id nullable, client_id nullable, contract_id nullable, type timeline_event_type, payload jsonb, actor_id, created_at)

RLS: authenticated staff (admin/manager/teacher/accountant) can read within their access; write scoped per role similar to leads.

Storage bucket: `contracts` (private) for generated PDFs, with RLS policies on `storage.objects`.

Seed: subscription plans (Повний день, Пів дня, NGO, Camp), one price version each, sample services per branch, empty discounts.

### 2. Server functions (`src/lib/*.functions.ts` under `_authenticated` usage)

- `admissions.functions.ts`:
  - `convertLeadToClient({ leadId })` — creates client + child + draft contract + timeline events in a single RPC-style handler using `supabaseAdmin` after `requireSupabaseAuth` verifies staff role. Returns new IDs. Idempotent — if lead already converted, return existing.
  - `generateContractPdf({ contractId })` — server-side PDF (pdf-lib) from placeholder template, uploads to `contracts` bucket, updates contract `pdf_url` + status → `generated`, inserts `client_attachments` row, logs timeline.
  - `generateInitialCharges({ contractId })` — creates 3 charges (prorated first if start_date not day 1), logs timeline. Called automatically at conversion.
- `search.functions.ts`:
  - `globalSearch({ query })` — searches leads, clients, children, groups; returns typed result list.

All read/writes go through authenticated server fns with the user's Supabase client (RLS-scoped) except PDF upload which needs admin client (loaded inside handler).

### 3. Routes / pages (new, additive)

- `/_authenticated/leads/$id` — Lead Details: two-column layout, form on left (all fields grouped: General / Parent / Child / CRM), Timeline on right. Actions: save, change status, **"Створити клієнта"** (opens confirm dialog → calls `convertLeadToClient` → navigates to client page).
- `/_authenticated/clients/$id` — Client Details with tabs: Основне, Діти, Фінанси (empty placeholder), Договір, Історія.
- `/_authenticated/clients.index` — small clients list linking to details (minimal, uses existing patterns).
- `/_authenticated/leads.index` — Extend existing leads page: rows link to `/leads/$id`.
- Contract tab renders draft contract with edit fields, `"Згенерувати договір"` button.

### 4. Global Search (Cmd/Ctrl+K)

- New `CommandPalette` component mounted in `AppShell`, keyboard listener for `⌘K`/`Ctrl+K`.
- Uses shadcn `Command` dialog. Debounced call to `globalSearch`. Groups: Ліди / Клієнти / Діти / Групи. Selecting a row navigates to the appropriate detail page.
- Replaces the disabled `SearchInput` in `TopBar` with a button that opens the palette (keeps visual identity).

### 5. Timeline component

Reusable `<Timeline events={...} />` used on Lead and Client pages. Renders event type → Ukrainian label + timestamp + actor.

### 6. PDF template

`src/lib/contract-pdf.ts` (server helper): builds a simple A4 PDF with pdf-lib containing contract number, parties (client, child), service, plan, monthly price, discount summary, dates, and signature blocks. Uses embedded Unicode font (fontkit + a bundled TTF) to render Ukrainian correctly.

### 7. Charges business rule

`generateInitialCharges`:
- `period_month = first day of month` for each of 3 months starting at contract.start_date's month.
- Full amount = monthly_price after discount.
- If start_date.day > 1 → first charge amount = round(monthly * (days_remaining_in_month / days_in_month), 2), `is_prorated = true`.
- Remaining two months = full amount.

### 8. What is NOT built

Finance UI, Charges UI, Payments, Attendance, Reports, Analytics, Notifications, Email, e-signatures. Existing pages remain unchanged except leads list row → link to details, and TopBar search → command palette trigger.

### Technical notes

- Every new public-schema table ships with `GRANT` block + RLS policies in the same migration.
- Roles reused via existing `has_role()` function.
- Migration is one file, non-destructive to current data.
- No changes to `src/routes/_authenticated/route.tsx`, sidebar, or design tokens.
- PDF built with `pdf-lib` + `@pdf-lib/fontkit`; TTF bundled under `src/assets/fonts/`.

### Success flow verified

Open lead → edit → change status → click **Створити клієнта** → confirm → land on client page with Основне populated, child in Діти, draft contract in Договір, 3 charges recorded, PDF generated & attached, timeline shows all events.
