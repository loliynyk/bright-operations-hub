-- =========================================================
-- Phase A: Finance foundation
-- =========================================================

-- ---------- groups.capacity ----------
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS capacity integer;

-- ---------- income_categories ----------
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
CREATE POLICY "income_categories read" ON public.income_categories FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "income_categories write" ON public.income_categories FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER income_categories_updated_at BEFORE UPDATE ON public.income_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.services   ADD COLUMN IF NOT EXISTS income_category_id uuid REFERENCES public.income_categories(id) ON DELETE SET NULL;
ALTER TABLE public.contracts  ADD COLUMN IF NOT EXISTS income_category_id uuid REFERENCES public.income_categories(id) ON DELETE SET NULL;
ALTER TABLE public.contracts  ADD COLUMN IF NOT EXISTS recalc_locked boolean NOT NULL DEFAULT false;

-- ---------- charges: due_date, paid_amount, overdue status ----------
ALTER TYPE public.charge_status ADD VALUE IF NOT EXISTS 'overdue';

ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

UPDATE public.charges SET due_date = period_month WHERE due_date IS NULL;
ALTER TABLE public.charges ALTER COLUMN due_date SET NOT NULL;
ALTER TABLE public.charges ALTER COLUMN due_date SET DEFAULT (date_trunc('month', now())::date);

CREATE INDEX IF NOT EXISTS charges_client_period_idx ON public.charges(client_id, period_month);
CREATE INDEX IF NOT EXISTS charges_status_idx ON public.charges(status);

-- ---------- payments: allocations model ----------
ALTER TABLE public.payments DROP COLUMN IF EXISTS charge_id;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void'));
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments(paid_at);
CREATE INDEX IF NOT EXISTS payments_client_idx ON public.payments(client_id);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  charge_id  uuid NOT NULL REFERENCES public.charges(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (payment_id, charge_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_allocations staff" ON public.payment_allocations FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE INDEX IF NOT EXISTS payment_allocations_charge_idx ON public.payment_allocations(charge_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations(payment_id);

-- ---------- client_credits (overpayment ledger) ----------
CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  source_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  amount_remaining numeric NOT NULL CHECK (amount_remaining >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_credits TO authenticated;
GRANT ALL ON public.client_credits TO service_role;
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_credits staff" ON public.client_credits FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER client_credits_updated_at BEFORE UPDATE ON public.client_credits FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS client_credits_client_idx ON public.client_credits(client_id) WHERE amount_remaining > 0;

-- ---------- charge_adjustments (audit trail) ----------
CREATE TABLE IF NOT EXISTS public.charge_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.charge_adjustments TO authenticated;
GRANT ALL ON public.charge_adjustments TO service_role;
ALTER TABLE public.charge_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charge_adjustments staff" ON public.charge_adjustments FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- ---------- Triggers: allocations -> charges.paid_amount + status ----------
CREATE OR REPLACE FUNCTION public.recompute_charge_status(_charge_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_paid numeric;
  v_due date;
  v_status public.charge_status;
BEGIN
  SELECT amount, due_date, status INTO v_amount, v_due, v_status
    FROM public.charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_status = 'cancelled' THEN RETURN; END IF;

  SELECT COALESCE(SUM(a.amount), 0) INTO v_paid
    FROM public.payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
   WHERE a.charge_id = _charge_id AND p.status = 'posted';

  IF v_paid >= v_amount AND v_amount > 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSIF v_due IS NOT NULL AND v_due < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'pending';
  END IF;

  UPDATE public.charges
     SET paid_amount = v_paid,
         status = v_status,
         updated_at = now()
   WHERE id = _charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_allocations_after()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_charge_status(OLD.charge_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.charge_id <> OLD.charge_id THEN
    PERFORM public.recompute_charge_status(OLD.charge_id);
    PERFORM public.recompute_charge_status(NEW.charge_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_charge_status(NEW.charge_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS allocations_after ON public.payment_allocations;
CREATE TRIGGER allocations_after
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.tg_allocations_after();

-- When a payment is voided, recompute all its allocated charges.
CREATE OR REPLACE FUNCTION public.tg_payments_after_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    FOR r IN SELECT charge_id FROM public.payment_allocations WHERE payment_id = NEW.id LOOP
      PERFORM public.recompute_charge_status(r.charge_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payments_after_status ON public.payments;
CREATE TRIGGER payments_after_status
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_payments_after_status();

-- Guard: block direct amount edits on paid/partial charges (must go through adjust_charge).
CREATE OR REPLACE FUNCTION public.tg_charges_guard_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount
     AND COALESCE(OLD.paid_amount, 0) > 0
     AND current_setting('bright.allow_charge_amount_change', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cannot change amount of a charge with payments; use adjust_charge()';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS charges_guard_amount ON public.charges;
CREATE TRIGGER charges_guard_amount
BEFORE UPDATE OF amount ON public.charges
FOR EACH ROW EXECUTE FUNCTION public.tg_charges_guard_amount();

-- Admin-invoked adjust: writes audit row and permits the amount change.
CREATE OR REPLACE FUNCTION public.adjust_charge(_charge_id uuid, _new_amount numeric, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old numeric;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _new_amount < 0 THEN RAISE EXCEPTION 'Amount must be >= 0'; END IF;
  SELECT amount INTO v_old FROM public.charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;
  PERFORM set_config('bright.allow_charge_amount_change', 'on', true);
  UPDATE public.charges SET amount = _new_amount, updated_at = now() WHERE id = _charge_id;
  PERFORM set_config('bright.allow_charge_amount_change', 'off', true);
  INSERT INTO public.charge_adjustments(charge_id, old_amount, new_amount, reason, actor_id)
    VALUES (_charge_id, v_old, _new_amount, _reason, v_actor);
  PERFORM public.recompute_charge_status(_charge_id);
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_charge(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_charge(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.recompute_charge_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_charge_status(uuid) TO authenticated;
