
CREATE OR REPLACE FUNCTION public.complete_child_attendance(
  _child_id uuid,
  _end_date date,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_child public.children%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_cancelled int := 0;
  v_period_cutoff date;
  v_today date := CURRENT_DATE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _end_date IS NULL THEN
    RAISE EXCEPTION 'Оберіть дату завершення';
  END IF;

  SELECT * INTO v_child FROM public.children WHERE id = _child_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дитину не знайдено'; END IF;

  UPDATE public.children
     SET end_date = _end_date,
         status = 'graduated',
         updated_at = now()
   WHERE id = _child_id;

  -- Cutoff: cancel any pending/overdue charges whose period starts AFTER the end month.
  v_period_cutoff := date_trunc('month', _end_date)::date;

  SELECT * INTO v_contract
    FROM public.contracts
   WHERE child_id = _child_id
     AND status IN ('confirmed','generated','signed','sent','draft')
   ORDER BY (status = 'draft'), updated_at DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.contracts
       SET end_date = COALESCE(LEAST(end_date, _end_date), _end_date),
           status = CASE WHEN _end_date <= v_today THEN 'completed'::contract_status ELSE status END,
           updated_at = now()
     WHERE id = v_contract.id;

    -- Cancel future unpaid charges only.
    WITH upd AS (
      UPDATE public.charges
         SET status = 'cancelled',
             updated_at = now()
       WHERE contract_id = v_contract.id
         AND period_month > v_period_cutoff
         AND COALESCE(paid_amount, 0) = 0
         AND status IN ('pending','overdue')
       RETURNING 1
    )
    SELECT count(*) INTO v_cancelled FROM upd;
  END IF;

  INSERT INTO public.timeline_events(client_id, branch_id, contract_id, type, payload, actor_id)
  VALUES (
    v_child.client_id,
    v_child.branch_id,
    v_contract.id,
    'status_changed',
    jsonb_build_object(
      'kind', 'child_completed',
      'child_id', _child_id,
      'child_name', trim(coalesce(v_child.first_name,'') || ' ' || coalesce(v_child.last_name,'')),
      'end_date', _end_date,
      'reason', _reason,
      'from', v_child.status,
      'to', 'graduated',
      'charges_cancelled', v_cancelled
    ),
    v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'charges_cancelled', v_cancelled,
    'contract_id', v_contract.id,
    'contract_closed', (v_contract.id IS NOT NULL AND _end_date <= v_today)
  );
END $$;
