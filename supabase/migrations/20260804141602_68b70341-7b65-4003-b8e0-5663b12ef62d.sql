-- 1. BACKUP -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads_status_backup_2026_08 (
  lead_id uuid PRIMARY KEY,
  status text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leads_status_backup_2026_08 TO authenticated;
GRANT ALL ON public.leads_status_backup_2026_08 TO service_role;
ALTER TABLE public.leads_status_backup_2026_08 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read status backup" ON public.leads_status_backup_2026_08
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

INSERT INTO public.leads_status_backup_2026_08 (lead_id, status)
SELECT id, status FROM public.leads
ON CONFLICT (lead_id) DO NOTHING;

-- 2. CATALOGUE COLUMNS ---------------------------------------------------
ALTER TABLE public.lead_statuses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS requires_next_action boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_closing_reason boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.lead_statuses
    ADD CONSTRAINT lead_statuses_category_chk
    CHECK (category IN ('open','converted','closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. SEED THE 13 FINALIZED STATUSES -------------------------------------
INSERT INTO public.lead_statuses (code, label, tone, sort_order, is_active, is_system, category, requires_next_action, requires_closing_reason) VALUES
  ('new',                      'Нова заявка',                 'bg-blue-500/15 text-blue-700 dark:text-blue-300',          10,  true, true,  'open',      true,  false),
  ('in_progress',              'В процесі',                   'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',    20,  true, true,  'open',      true,  false),
  ('visit_scheduled',          'Огляд заплановано',           'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300', 30,  true, true,  'open',      true,  false),
  ('visit_missed',             'Огляд не відбувся',           'bg-orange-500/15 text-orange-700 dark:text-orange-300',    40,  true, true,  'open',      true,  false),
  ('visit_completed_deciding', 'Огляд відбувся — думають',    'bg-pink-500/15 text-pink-700 dark:text-pink-300',          50,  true, true,  'open',      true,  false),
  ('future_interest',          'Планують пізніше',            'bg-slate-500/15 text-slate-700 dark:text-slate-300',       60,  true, true,  'open',      true,  false),
  ('reserved',                 'Бронювання',                  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',          70,  true, true,  'open',      true,  false),
  ('contract_signing',         'Договір на підписі',          'bg-teal-500/15 text-teal-700 dark:text-teal-300',          80,  true, true,  'open',      true,  false),
  ('converted',                'Конвертовано в клієнта',      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', 90,  true, true,  'converted', false, false),
  ('declined_before_visit',    'Відмовились до огляду',       'bg-rose-500/15 text-rose-700 dark:text-rose-300',          100, true, true,  'closed',    false, true),
  ('declined_after_visit',     'Відмовились після огляду',    'bg-rose-500/15 text-rose-700 dark:text-rose-300',          110, true, true,  'closed',    false, true),
  ('unreachable',              'Не вдалося зв''язатися',      'bg-amber-500/20 text-amber-800 dark:text-amber-300',       120, true, true,  'closed',    false, true),
  ('not_accepted',             'Не беремо',                   'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',          130, true, true,  'closed',    false, true)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  tone = EXCLUDED.tone,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  is_system = true,
  category = EXCLUDED.category,
  requires_next_action = EXCLUDED.requires_next_action,
  requires_closing_reason = EXCLUDED.requires_closing_reason,
  is_legacy = false;

-- 4. UNAMBIGUOUS REMAPPING ONLY -----------------------------------------
-- contacted -> in_progress
UPDATE public.leads SET status = 'in_progress' WHERE status = 'contacted';
-- contract -> reserved (no contract was ever sent in the legacy system)
UPDATE public.leads SET status = 'reserved' WHERE status = 'contract';
-- waiting WITH a known desired start -> future_interest; without one it stays for manual review
UPDATE public.leads SET status = 'future_interest'
  WHERE status = 'waiting' AND desired_start_date IS NOT NULL;

-- 5. LEGACY STATUSES: readable, not newly assignable ---------------------
UPDATE public.lead_statuses
   SET is_active = false, is_legacy = true, category = 'closed'
 WHERE code IN ('lost','archived','waiting','trial','tour_scheduled','tour_done','negotiation','won','contract','contacted');

-- 6. MANUAL REVIEW LIST --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_status_manual_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  legacy_status text NOT NULL,
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_status_manual_review TO authenticated;
GRANT ALL ON public.lead_status_manual_review TO service_role;
ALTER TABLE public.lead_status_manual_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read review" ON public.lead_status_manual_review
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff resolve review" ON public.lead_status_manual_review
  FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

INSERT INTO public.lead_status_manual_review (lead_id, legacy_status, reason)
SELECT id, status,
  CASE status
    WHEN 'lost' THEN 'Немає історії огляду — неможливо визначити відмову до чи після огляду'
    WHEN 'waiting' THEN 'Немає бажаної дати старту — неможливо підтвердити «Планують пізніше»'
    WHEN 'archived' THEN 'Архівний статус без причини закриття'
    ELSE 'Неоднозначний застарілий статус'
  END
FROM public.leads
WHERE status IN ('lost','waiting','archived')
ON CONFLICT (lead_id) DO NOTHING;