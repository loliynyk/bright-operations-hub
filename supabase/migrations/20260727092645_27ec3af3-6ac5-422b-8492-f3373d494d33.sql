
-- 1. Idempotency column for payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_external_ref_uidx
  ON public.payments (external_ref) WHERE external_ref IS NOT NULL;

-- 2. reallocate_payment RPC
CREATE OR REPLACE FUNCTION public.reallocate_payment(_payment_id uuid, _allocations jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payment public.payments%ROWTYPE;
  v_alloc record;
  v_charge public.charges%ROWTYPE;
  v_total numeric := 0;
  v_other numeric;
  v_leftover numeric;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Платіж не знайдено'; END IF;
  IF v_payment.status <> 'posted' THEN
    RAISE EXCEPTION 'Скасований платіж не можна перерозподілити';
  END IF;

  FOR v_alloc IN
    SELECT (e->>'charge_id')::uuid AS charge_id, (e->>'amount')::numeric AS amount
    FROM jsonb_array_elements(COALESCE(_allocations, '[]'::jsonb)) e
  LOOP
    IF v_alloc.amount <= 0 THEN RAISE EXCEPTION 'Некоректна сума розподілу'; END IF;
    v_total := v_total + v_alloc.amount;
    SELECT * INTO v_charge FROM public.charges WHERE id = v_alloc.charge_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Нарахування не знайдено'; END IF;
    IF v_charge.client_id <> v_payment.client_id THEN
      RAISE EXCEPTION 'Нарахування іншого клієнта';
    END IF;
    IF v_charge.status = 'cancelled' THEN
      RAISE EXCEPTION 'Скасоване нарахування недоступне для розподілу';
    END IF;
    SELECT COALESCE(SUM(pa.amount), 0) INTO v_other
      FROM public.payment_allocations pa
      JOIN public.payments p ON p.id = pa.payment_id
     WHERE pa.charge_id = v_alloc.charge_id
       AND pa.payment_id <> _payment_id
       AND p.status = 'posted';
    IF v_other + v_alloc.amount > v_charge.amount + 0.005 THEN
      RAISE EXCEPTION 'Розподіл % ₴ перевищує залишок нарахування (%)',
        v_alloc.amount, ROUND(v_charge.amount - v_other, 2);
    END IF;
  END LOOP;

  IF v_total > v_payment.amount + 0.005 THEN
    RAISE EXCEPTION 'Сума розподілу перевищує суму платежу';
  END IF;

  DELETE FROM public.payment_allocations WHERE payment_id = _payment_id;
  INSERT INTO public.payment_allocations(payment_id, charge_id, amount, created_by)
  SELECT _payment_id, (e->>'charge_id')::uuid, ROUND((e->>'amount')::numeric, 2), v_actor
    FROM jsonb_array_elements(COALESCE(_allocations, '[]'::jsonb)) e;

  v_leftover := GREATEST(0, ROUND(v_payment.amount - v_total, 2));
  UPDATE public.client_credits
     SET amount_remaining = v_leftover, updated_at = now()
   WHERE source_payment_id = _payment_id;
  IF NOT FOUND AND v_leftover > 0.005 THEN
    INSERT INTO public.client_credits(client_id, branch_id, source_payment_id, amount_remaining)
    VALUES (v_payment.client_id, v_payment.branch_id, _payment_id, v_leftover);
  END IF;

  INSERT INTO public.timeline_events(client_id, branch_id, type, payload, actor_id)
  VALUES (v_payment.client_id, v_payment.branch_id, 'note_added',
    jsonb_build_object(
      'kind','payment_reallocated',
      'payment_id', _payment_id,
      'total', ROUND(v_total,2),
      'credit', v_leftover,
      'allocations', _allocations
    ), v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.reallocate_payment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reallocate_payment(uuid, jsonb) TO authenticated;

-- 3. post_payment RPC
CREATE OR REPLACE FUNCTION public.post_payment(
  _client_id uuid,
  _branch_id uuid,
  _amount numeric,
  _paid_at timestamptz,
  _payment_method_id uuid,
  _note text,
  _allocations jsonb,
  _external_ref text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payment_id uuid;
  v_remaining numeric := _amount;
  v_alloc record;
  v_charge public.charges%ROWTYPE;
  v_take numeric;
  v_total_alloc numeric := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Сума платежу має бути більше 0';
  END IF;

  -- Idempotency: return existing payment if external_ref already used.
  IF _external_ref IS NOT NULL THEN
    SELECT id INTO v_payment_id FROM public.payments WHERE external_ref = _external_ref;
    IF v_payment_id IS NOT NULL THEN RETURN v_payment_id; END IF;
  END IF;

  INSERT INTO public.payments(
    client_id, branch_id, amount, paid_at, payment_method_id, note, status, created_by, external_ref
  ) VALUES (
    _client_id, _branch_id, _amount, _paid_at, _payment_method_id, _note, 'posted', v_actor, _external_ref
  ) RETURNING id INTO v_payment_id;

  IF _allocations IS NOT NULL AND jsonb_array_length(_allocations) > 0 THEN
    FOR v_alloc IN
      SELECT (e->>'charge_id')::uuid AS charge_id, (e->>'amount')::numeric AS amount
      FROM jsonb_array_elements(_allocations) e
    LOOP
      IF v_alloc.amount <= 0 THEN RAISE EXCEPTION 'Некоректна сума розподілу'; END IF;
      SELECT * INTO v_charge FROM public.charges WHERE id = v_alloc.charge_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Нарахування не знайдено'; END IF;
      IF v_charge.client_id <> _client_id THEN
        RAISE EXCEPTION 'Нарахування іншого клієнта';
      END IF;
      IF v_charge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Скасоване нарахування недоступне для розподілу';
      END IF;
      v_total_alloc := v_total_alloc + v_alloc.amount;
      IF v_total_alloc > _amount + 0.005 THEN
        RAISE EXCEPTION 'Розподіл перевищує суму платежу';
      END IF;
      IF v_charge.amount - v_charge.paid_amount + 0.005 < v_alloc.amount THEN
        RAISE EXCEPTION 'Розподіл перевищує залишок нарахування';
      END IF;
      INSERT INTO public.payment_allocations(payment_id, charge_id, amount, created_by)
      VALUES (v_payment_id, v_alloc.charge_id, ROUND(v_alloc.amount, 2), v_actor);
    END LOOP;
    v_remaining := _amount - v_total_alloc;
  ELSE
    -- FIFO across open charges
    FOR v_charge IN
      SELECT * FROM public.charges
       WHERE client_id = _client_id
         AND status IN ('pending','partial','overdue')
       ORDER BY period_month ASC, due_date ASC, created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0.005;
      v_take := LEAST(v_charge.amount - v_charge.paid_amount, v_remaining);
      IF v_take > 0.005 THEN
        INSERT INTO public.payment_allocations(payment_id, charge_id, amount, created_by)
        VALUES (v_payment_id, v_charge.id, ROUND(v_take, 2), v_actor);
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END IF;

  IF v_remaining > 0.005 THEN
    INSERT INTO public.client_credits(client_id, branch_id, source_payment_id, amount_remaining)
    VALUES (_client_id, _branch_id, v_payment_id, ROUND(v_remaining, 2));
  END IF;

  INSERT INTO public.timeline_events(client_id, branch_id, type, payload, actor_id)
  VALUES (_client_id, _branch_id, 'note_added',
    jsonb_build_object(
      'kind','payment_posted',
      'payment_id', v_payment_id,
      'amount', _amount,
      'credit', GREATEST(0, ROUND(v_remaining, 2)),
      'external_ref', _external_ref
    ), v_actor);

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_payment(uuid, uuid, numeric, timestamptz, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payment(uuid, uuid, numeric, timestamptz, uuid, text, jsonb, text) TO authenticated;

-- 4. void_payment RPC
CREATE OR REPLACE FUNCTION public.void_payment(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payment public.payments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Платіж не знайдено'; END IF;
  IF v_payment.status = 'void' THEN RETURN; END IF;

  DELETE FROM public.payment_allocations WHERE payment_id = _payment_id;
  UPDATE public.client_credits
     SET amount_remaining = 0, updated_at = now()
   WHERE source_payment_id = _payment_id;
  UPDATE public.payments SET status = 'void' WHERE id = _payment_id;

  INSERT INTO public.timeline_events(client_id, branch_id, type, payload, actor_id)
  VALUES (v_payment.client_id, v_payment.branch_id, 'note_added',
    jsonb_build_object('kind','payment_voided','payment_id', _payment_id, 'amount', v_payment.amount),
    v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.void_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payment(uuid) TO authenticated;

-- 5. apply_credits_to_charge RPC
CREATE OR REPLACE FUNCTION public.apply_credits_to_charge(_charge_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_charge public.charges%ROWTYPE;
  v_credit record;
  v_take numeric;
  v_remaining numeric;
  v_applied numeric := 0;
BEGIN
  SELECT * INTO v_charge FROM public.charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_charge.status = 'cancelled' THEN RETURN 0; END IF;
  v_remaining := v_charge.amount - COALESCE(v_charge.paid_amount, 0);
  IF v_remaining <= 0.005 THEN RETURN 0; END IF;

  FOR v_credit IN
    SELECT c.* FROM public.client_credits c
     WHERE c.client_id = v_charge.client_id
       AND c.amount_remaining > 0.005
       AND c.source_payment_id IS NOT NULL
     ORDER BY c.created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.005;
    v_take := LEAST(v_credit.amount_remaining, v_remaining);
    INSERT INTO public.payment_allocations(payment_id, charge_id, amount, created_by)
    VALUES (v_credit.source_payment_id, _charge_id, ROUND(v_take, 2), v_actor);
    UPDATE public.client_credits
       SET amount_remaining = amount_remaining - v_take,
           updated_at = now()
     WHERE id = v_credit.id;
    v_remaining := v_remaining - v_take;
    v_applied := v_applied + v_take;
  END LOOP;

  IF v_applied > 0 THEN
    INSERT INTO public.timeline_events(client_id, branch_id, type, payload, actor_id)
    VALUES (v_charge.client_id, v_charge.branch_id, 'note_added',
      jsonb_build_object(
        'kind','credit_applied',
        'charge_id', _charge_id,
        'amount', ROUND(v_applied, 2),
        'period_month', v_charge.period_month
      ), v_actor);
  END IF;
  RETURN ROUND(v_applied, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credits_to_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_credits_to_charge(uuid) TO authenticated;

-- 6. Deterministic charge balances view
CREATE OR REPLACE VIEW public.v_charge_balances AS
SELECT
  c.id,
  c.client_id,
  c.branch_id,
  c.contract_id,
  c.period_month,
  c.due_date,
  c.amount,
  COALESCE(SUM(pa.amount) FILTER (WHERE p.status = 'posted'), 0) AS allocated,
  GREATEST(0, c.amount - COALESCE(SUM(pa.amount) FILTER (WHERE p.status = 'posted'), 0)) AS remaining,
  CASE
    WHEN c.status = 'cancelled' THEN 'cancelled'
    WHEN COALESCE(SUM(pa.amount) FILTER (WHERE p.status = 'posted'), 0) + 0.005 >= c.amount THEN 'paid'
    WHEN COALESCE(SUM(pa.amount) FILTER (WHERE p.status = 'posted'), 0) > 0 THEN 'partial'
    WHEN c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END AS derived_status
FROM public.charges c
LEFT JOIN public.payment_allocations pa ON pa.charge_id = c.id
LEFT JOIN public.payments p ON p.id = pa.payment_id
GROUP BY c.id;

GRANT SELECT ON public.v_charge_balances TO authenticated;
