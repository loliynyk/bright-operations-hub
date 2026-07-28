
-- ============================================================
-- 1. EXTEND employees
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.employee_status AS ENUM ('active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contract','intern','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payroll_status AS ENUM ('not_paid','partial','paid','overpaid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payroll_payment_type AS ENUM ('advance','salary','cash_part','bonus','adjustment','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payroll_payment_method AS ENUM ('bank_transfer','card_transfer','cash','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS status public.employee_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_key
  ON public.employees(employee_number) WHERE employee_number IS NOT NULL;

-- ============================================================
-- 2. employee_salaries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary numeric(14,2) NOT NULL CHECK (base_salary >= 0),
  currency text NOT NULL DEFAULT 'UAH',
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_salaries_emp_from_idx
  ON public.employee_salaries(employee_id, effective_from DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_salaries TO authenticated;
GRANT ALL ON public.employee_salaries TO service_role;
ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_salaries_read" ON public.employee_salaries
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "employee_salaries_write" ON public.employee_salaries
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid()));

-- ============================================================
-- 3. employee_payrolls
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_payrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  period_month date NOT NULL,
  base_salary_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UAH',
  bonus_amount numeric(14,2) NOT NULL DEFAULT 0,
  bonus_description text,
  deduction_amount numeric(14,2) NOT NULL DEFAULT 0,
  deduction_description text,
  amount_to_pay numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  amount_outstanding numeric(14,2) NOT NULL DEFAULT 0,
  status public.payroll_status NOT NULL DEFAULT 'not_paid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_month)
);
CREATE INDEX IF NOT EXISTS employee_payrolls_period_idx ON public.employee_payrolls(period_month DESC);
CREATE INDEX IF NOT EXISTS employee_payrolls_branch_idx ON public.employee_payrolls(branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payrolls TO authenticated;
GRANT ALL ON public.employee_payrolls TO service_role;
ALTER TABLE public.employee_payrolls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_payrolls_read" ON public.employee_payrolls
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "employee_payrolls_write" ON public.employee_payrolls
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid()));

CREATE TRIGGER employee_payrolls_updated_at
  BEFORE UPDATE ON public.employee_payrolls
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 4. payroll_payment_sources (configurable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_payment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payment_sources TO authenticated;
GRANT ALL ON public.payroll_payment_sources TO service_role;
ALTER TABLE public.payroll_payment_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_payment_sources_read" ON public.payroll_payment_sources
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "payroll_payment_sources_write" ON public.payroll_payment_sources
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid()));

CREATE TRIGGER payroll_payment_sources_updated_at
  BEFORE UPDATE ON public.payroll_payment_sources
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default sources (branch_id NULL = global)
INSERT INTO public.payroll_payment_sources (branch_id, name)
SELECT NULL, x FROM (VALUES
  ('Розрахунковий рахунок компанії'),
  ('Каса'),
  ('Картка директора'),
  ('Каса філії'),
  ('Інше')
) AS t(x)
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_payment_sources WHERE branch_id IS NULL AND name = t.x);

-- ============================================================
-- 5. payroll_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.employee_payrolls(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_type public.payroll_payment_type NOT NULL DEFAULT 'salary',
  source_id uuid REFERENCES public.payroll_payment_sources(id) ON DELETE SET NULL,
  payment_method public.payroll_payment_method NOT NULL DEFAULT 'bank_transfer',
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_payments_payroll_idx ON public.payroll_payments(payroll_id);
CREATE INDEX IF NOT EXISTS payroll_payments_employee_idx ON public.payroll_payments(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
GRANT ALL ON public.payroll_payments TO service_role;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_payments_read" ON public.payroll_payments
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "payroll_payments_write" ON public.payroll_payments
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid()))
  WITH CHECK (public.has_any_role(auth.uid()));

-- ============================================================
-- 6. Recompute function + trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_payroll(_payroll_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_paid numeric := 0;
  v_to_pay numeric;
  v_out numeric;
  v_status public.payroll_status;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM public.payroll_payments WHERE payroll_id = _payroll_id;

  UPDATE public.employee_payrolls
     SET amount_to_pay = COALESCE(base_salary_snapshot,0) + COALESCE(bonus_amount,0) - COALESCE(deduction_amount,0),
         amount_paid = v_paid
   WHERE id = _payroll_id
   RETURNING amount_to_pay INTO v_to_pay;

  IF v_to_pay IS NULL THEN RETURN; END IF;
  v_out := v_to_pay - v_paid;

  IF v_paid = 0 THEN v_status := 'not_paid';
  ELSIF v_paid < v_to_pay THEN v_status := 'partial';
  ELSIF v_paid = v_to_pay THEN v_status := 'paid';
  ELSE v_status := 'overpaid';
  END IF;

  UPDATE public.employee_payrolls
     SET amount_outstanding = v_out, status = v_status, updated_at = now()
   WHERE id = _payroll_id;
END $$;

CREATE OR REPLACE FUNCTION public.tg_payroll_payments_after()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_payroll(OLD.payroll_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.payroll_id <> OLD.payroll_id THEN
    PERFORM public.recompute_payroll(OLD.payroll_id);
    PERFORM public.recompute_payroll(NEW.payroll_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_payroll(NEW.payroll_id);
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS payroll_payments_after ON public.payroll_payments;
CREATE TRIGGER payroll_payments_after
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_payments_after();

CREATE OR REPLACE FUNCTION public.tg_payroll_recompute_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.base_salary_snapshot <> OLD.base_salary_snapshot
     OR NEW.bonus_amount <> OLD.bonus_amount
     OR NEW.deduction_amount <> OLD.deduction_amount THEN
    PERFORM public.recompute_payroll(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS employee_payrolls_recompute ON public.employee_payrolls;
CREATE TRIGGER employee_payrolls_recompute
  AFTER UPDATE ON public.employee_payrolls
  FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_recompute_on_update();

-- ============================================================
-- 7. add_employee_salary
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_employee_salary(
  _employee_id uuid,
  _base_salary numeric,
  _currency text,
  _effective_from date,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_new uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _base_salary IS NULL OR _base_salary < 0 THEN
    RAISE EXCEPTION 'Некоректна сума';
  END IF;
  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'Оберіть дату початку дії';
  END IF;

  -- Close any currently open row that starts before the new one.
  UPDATE public.employee_salaries
     SET effective_to = _effective_from - INTERVAL '1 day'
   WHERE employee_id = _employee_id
     AND effective_to IS NULL
     AND effective_from < _effective_from;

  INSERT INTO public.employee_salaries(employee_id, base_salary, currency, effective_from, notes, created_by)
  VALUES (_employee_id, _base_salary, COALESCE(_currency,'UAH'), _effective_from, _notes, v_actor)
  RETURNING id INTO v_new;

  RETURN v_new;
END $$;

-- ============================================================
-- 8. generate_monthly_payroll (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_monthly_payroll(
  _branch_id uuid,
  _period_month date
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_month date := date_trunc('month', _period_month)::date;
  v_next date := (v_month + INTERVAL '1 month')::date;
  v_created int := 0;
  r record;
  v_sal record;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN
    SELECT e.* FROM public.employees e
    WHERE (_branch_id IS NULL OR e.branch_id = _branch_id)
      AND e.status = 'active'
      AND e.is_active = true
  LOOP
    -- Find effective salary for the month (latest effective_from <= v_month, not closed before v_month)
    SELECT s.base_salary, s.currency
      INTO v_sal
      FROM public.employee_salaries s
     WHERE s.employee_id = r.id
       AND s.effective_from <= (v_next - INTERVAL '1 day')::date
       AND (s.effective_to IS NULL OR s.effective_to >= v_month)
     ORDER BY s.effective_from DESC
     LIMIT 1;

    INSERT INTO public.employee_payrolls(
      employee_id, branch_id, period_month,
      base_salary_snapshot, currency,
      amount_to_pay, amount_outstanding, status
    ) VALUES (
      r.id, r.branch_id, v_month,
      COALESCE(v_sal.base_salary, 0),
      COALESCE(v_sal.currency, 'UAH'),
      COALESCE(v_sal.base_salary, 0),
      COALESCE(v_sal.base_salary, 0),
      'not_paid'
    )
    ON CONFLICT (employee_id, period_month) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN v_created;
END $$;
