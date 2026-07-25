
-- 1. Extend charge_status with 'overdue'
ALTER TYPE public.charge_status ADD VALUE IF NOT EXISTS 'overdue';

-- 2. Charges: paid_amount cache + due_date
ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date;

UPDATE public.charges SET due_date = period_month WHERE due_date IS NULL;
ALTER TABLE public.charges ALTER COLUMN due_date SET NOT NULL;
ALTER TABLE public.charges ALTER COLUMN due_date SET DEFAULT CURRENT_DATE;

-- 3. Contracts: recalc lock + income category link
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS recalc_locked boolean NOT NULL DEFAULT false;

-- 4. Groups: capacity
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS capacity integer;

-- 5. Payments: posted/void status
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('posted','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'posted';

-- 6. income_categories
CREATE TABLE IF NOT EXISTS public.income_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_categories TO authenticated;
GRANT ALL ON public.income_categories TO service_role;
ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY income_categories_read ON public.income_categories FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY income_categories_write ON public.income_categories FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER income_categories_touch BEFORE UPDATE ON public.income_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS income_category_id uuid REFERENCES public.income_categories(id) ON DELETE SET NULL;
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS income_category_id uuid REFERENCES public.income_categories(id) ON DELETE SET NULL;

-- 7. payment_allocations
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_allocations_charge_idx ON public.payment_allocations(charge_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations(payment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_allocations_all ON public.payment_allocations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- 8. client_credits
CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  source_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  amount_remaining numeric NOT NULL DEFAULT 0 CHECK (amount_remaining >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_credits_client_idx ON public.client_credits(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_credits TO authenticated;
GRANT ALL ON public.client_credits TO service_role;
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_credits_all ON public.client_credits FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER client_credits_touch BEFORE UPDATE ON public.client_credits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 9. charge_adjustments (audit)
CREATE TABLE IF NOT EXISTS public.charge_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  previous_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  reason text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS charge_adjustments_charge_idx ON public.charge_adjustments(charge_id);
GRANT SELECT, INSERT ON public.charge_adjustments TO authenticated;
GRANT ALL ON public.charge_adjustments TO service_role;
ALTER TABLE public.charge_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY charge_adjustments_read ON public.charge_adjustments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY charge_adjustments_insert ON public.charge_adjustments FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

-- 10. Trigger: recompute charge.paid_amount + status from allocations
CREATE OR REPLACE FUNCTION public.recompute_charge_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_charge uuid;
  v_amount numeric;
  v_paid numeric;
  v_status charge_status;
  v_cur_status charge_status;
BEGIN
  v_charge := COALESCE(NEW.charge_id, OLD.charge_id);
  SELECT amount, status INTO v_amount, v_cur_status FROM public.charges WHERE id = v_charge;
  IF v_amount IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(pa.amount), 0) INTO v_paid
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  WHERE pa.charge_id = v_charge AND p.status = 'posted';

  IF v_cur_status = 'cancelled' THEN
    v_status := 'cancelled';
  ELSIF v_paid <= 0 THEN
    v_status := CASE WHEN v_cur_status = 'overdue' THEN 'overdue' ELSE 'pending' END;
  ELSIF v_paid + 0.005 >= v_amount THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.charges SET paid_amount = v_paid, status = v_status WHERE id = v_charge;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS payment_allocations_recompute ON public.payment_allocations;
CREATE TRIGGER payment_allocations_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.recompute_charge_paid();

-- Also recompute when a payment is voided/reposted
CREATE OR REPLACE FUNCTION public.recompute_charges_for_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    FOR r IN SELECT DISTINCT charge_id FROM public.payment_allocations WHERE payment_id = NEW.id LOOP
      PERFORM public.recompute_one_charge(r.charge_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.recompute_one_charge(_charge_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_amount numeric;
  v_paid numeric;
  v_status charge_status;
  v_cur charge_status;
BEGIN
  SELECT amount, status INTO v_amount, v_cur FROM public.charges WHERE id = _charge_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_paid
  FROM public.payment_allocations pa
  JOIN public.payments p ON p.id = pa.payment_id
  WHERE pa.charge_id = _charge_id AND p.status = 'posted';
  IF v_cur = 'cancelled' THEN
    v_status := 'cancelled';
  ELSIF v_paid <= 0 THEN
    v_status := CASE WHEN v_cur = 'overdue' THEN 'overdue' ELSE 'pending' END;
  ELSIF v_paid + 0.005 >= v_amount THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;
  UPDATE public.charges SET paid_amount = v_paid, status = v_status WHERE id = _charge_id;
END $$;

DROP TRIGGER IF EXISTS payments_status_change ON public.payments;
CREATE TRIGGER payments_status_change
  AFTER UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_charges_for_payment();

-- 11. adjust_charge RPC
CREATE OR REPLACE FUNCTION public.adjust_charge(_charge_id uuid, _new_amount numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev numeric; v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _new_amount < 0 THEN RAISE EXCEPTION 'Сума не може бути від''ємною'; END IF;
  SELECT amount INTO v_prev FROM public.charges WHERE id = _charge_id FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Нарахування не знайдено'; END IF;
  INSERT INTO public.charge_adjustments(charge_id, previous_amount, new_amount, reason, actor_id)
    VALUES (_charge_id, v_prev, _new_amount, _reason, v_actor);
  UPDATE public.charges SET amount = _new_amount WHERE id = _charge_id;
  PERFORM public.recompute_one_charge(_charge_id);
END $$;

REVOKE ALL ON FUNCTION public.adjust_charge(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_charge(uuid, numeric, text) TO authenticated;

-- 12. Bright-defaults for two seed income categories (idempotent)
INSERT INTO public.income_categories(name) VALUES ('Абонплата'), ('Разові послуги')
ON CONFLICT (name) DO NOTHING;
