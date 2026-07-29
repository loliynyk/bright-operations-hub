
CREATE TABLE public.lead_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  tone text NOT NULL DEFAULT 'bg-muted text-foreground',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_statuses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lead_statuses TO authenticated;
GRANT ALL ON public.lead_statuses TO service_role;

ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_statuses_select_auth" ON public.lead_statuses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lead_statuses_insert_admin" ON public.lead_statuses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "lead_statuses_update_admin" ON public.lead_statuses
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "lead_statuses_delete_admin" ON public.lead_statuses
  FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) AND is_system = false);

CREATE TRIGGER lead_statuses_set_updated_at
  BEFORE UPDATE ON public.lead_statuses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.lead_statuses (code, label, tone, sort_order, is_active, is_system) VALUES
  ('new',            'Новий',                  'bg-blue-500/15 text-blue-700 dark:text-blue-300',           10, true, true),
  ('contacted',      'Зв''язались',            'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',     20, true, false),
  ('waiting',        'Очікує',                 'bg-slate-500/15 text-slate-700 dark:text-slate-300',        30, true, false),
  ('trial',          'Пробне заняття',         'bg-purple-500/15 text-purple-700 dark:text-purple-300',     40, true, false),
  ('tour_scheduled', 'Екскурсія призначена',   'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',  50, true, false),
  ('tour_done',      'Екскурсія проведена',    'bg-pink-500/15 text-pink-700 dark:text-pink-300',           60, true, false),
  ('negotiation',    'Переговори',             'bg-amber-500/20 text-amber-800 dark:text-amber-300',        70, true, false),
  ('contract',       'Договір',                'bg-teal-500/15 text-teal-700 dark:text-teal-300',           80, true, false),
  ('converted',      'Конвертований',          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',  90, true, true),
  ('won',            'Оформлений',             'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', 100, true, false),
  ('lost',           'Втрачений',              'bg-rose-500/15 text-rose-700 dark:text-rose-300',          110, true, true),
  ('archived',       'Архів',                  'bg-muted text-muted-foreground',                           120, true, true);
