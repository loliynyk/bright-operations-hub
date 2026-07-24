
-- =========================================================
-- 1. Simplify RLS: authenticated users have full access
-- =========================================================

-- Helper to (re)apply the standard authenticated-full-access policy set
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'branches','services','leads','clients','children','groups',
    'contracts','subscription_plans','price_versions','discounts',
    'charges','client_attachments','timeline_events'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop existing policies
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY "auth_all_select" ON public.%I FOR SELECT TO authenticated USING (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "auth_all_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "auth_all_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "auth_all_delete" ON public.%I FOR DELETE TO authenticated USING (true)$f$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- =========================================================
-- 2. Lookup tables (idempotent create) + new tables
-- =========================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.expense_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  position text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  charge_id uuid REFERENCES public.charges(id) ON DELETE SET NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  spent_at date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers for new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','expense_categories','employees','payments','expenses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', t);
  END LOOP;
END $$;

-- =========================================================
-- 3. Transactional lead-conversion RPC
-- =========================================================

CREATE OR REPLACE FUNCTION public.convert_lead_to_client(_lead_id uuid)
RETURNS TABLE(client_id uuid, child_id uuid, contract_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_child_id uuid;
  v_contract_id uuid;
  v_plan_id uuid;
  v_price_id uuid;
  v_price numeric := 0;
  v_start date;
  v_parent_first text;
  v_parent_last text;
  v_child_first text;
  v_child_last text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Лід не знайдено'; END IF;

  IF v_lead.converted_client_id IS NOT NULL THEN
    RETURN QUERY SELECT v_lead.converted_client_id, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_lead.branch_id IS NULL THEN
    RAISE EXCEPTION 'Оберіть філію в ліді перед конвертацією';
  END IF;

  v_parent_first := COALESCE(v_lead.parent_first_name, split_part(COALESCE(v_lead.parent_name,''),' ',1), 'Батьки');
  v_parent_last  := COALESCE(v_lead.parent_last_name, NULLIF(regexp_replace(COALESCE(v_lead.parent_name,''), '^\S+\s*',''),''), '—');
  v_child_first  := COALESCE(v_lead.child_first_name, v_lead.child_name, 'Дитина');
  v_child_last   := v_lead.child_last_name;

  INSERT INTO public.clients(branch_id, lead_id, service_id, parent_first_name, parent_last_name,
                             phone, email, address, notes, created_by)
  VALUES (v_lead.branch_id, v_lead.id, v_lead.service_id, v_parent_first, v_parent_last,
          v_lead.parent_phone, v_lead.parent_email, v_lead.parent_address, v_lead.notes, v_actor)
  RETURNING id INTO v_client_id;

  INSERT INTO public.children(client_id, branch_id, first_name, last_name, birth_date, start_date)
  VALUES (v_client_id, v_lead.branch_id, v_child_first, v_child_last, v_lead.child_birthdate, v_lead.desired_start_date)
  RETURNING id INTO v_child_id;

  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE is_active LIMIT 1;
  IF v_plan_id IS NOT NULL THEN
    SELECT id, monthly_price INTO v_price_id, v_price
      FROM public.price_versions WHERE plan_id = v_plan_id AND is_active LIMIT 1;
  END IF;
  v_start := COALESCE(v_lead.desired_start_date, CURRENT_DATE);

  INSERT INTO public.contracts(branch_id, client_id, child_id, service_id, plan_id, price_version_id,
                               monthly_price, start_date, status, created_by, number)
  VALUES (v_lead.branch_id, v_client_id, v_child_id, v_lead.service_id, v_plan_id, v_price_id,
          COALESCE(v_price,0), v_start, 'draft', v_actor,
          'C-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6))
  RETURNING id INTO v_contract_id;

  UPDATE public.leads SET status = 'converted', converted_client_id = v_client_id, updated_at = now()
   WHERE id = v_lead.id;

  INSERT INTO public.timeline_events(lead_id, client_id, type, payload, actor_id)
    VALUES (v_lead.id, v_client_id, 'status_changed', jsonb_build_object('from', v_lead.status, 'to', 'converted'), v_actor);
  INSERT INTO public.timeline_events(lead_id, client_id, type, payload, actor_id)
    VALUES (v_lead.id, v_client_id, 'client_created', '{}'::jsonb, v_actor);
  INSERT INTO public.timeline_events(client_id, contract_id, type, payload, actor_id)
    VALUES (v_client_id, v_contract_id, 'contract_generated', '{}'::jsonb, v_actor);

  RETURN QUERY SELECT v_client_id, v_child_id, v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_lead_to_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client(uuid) TO authenticated;
