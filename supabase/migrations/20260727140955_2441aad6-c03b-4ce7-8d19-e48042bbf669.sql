
-- Extend departure RPC with structured reason codes.
CREATE OR REPLACE FUNCTION public.complete_child_attendance(
  _child_id uuid,
  _end_date date,
  _reason text,
  _reason_code text DEFAULT 'other',
  _note text DEFAULT NULL
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
  v_new_child_status public.child_status;
  v_new_contract_status public.contract_status;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _end_date IS NULL THEN
    RAISE EXCEPTION 'Оберіть дату завершення';
  END IF;
  IF _reason_code IS NULL OR _reason_code NOT IN ('completed','moved','withdrew','other') THEN
    RAISE EXCEPTION 'Некоректний код причини';
  END IF;

  SELECT * INTO v_child FROM public.children WHERE id = _child_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дитину не знайдено'; END IF;

  -- Map reason → child status.
  v_new_child_status := CASE WHEN _reason_code = 'completed' THEN 'graduated'::public.child_status
                             ELSE 'archived'::public.child_status END;

  UPDATE public.children
     SET end_date = _end_date,
         status = v_new_child_status,
         updated_at = now()
   WHERE id = _child_id;

  v_period_cutoff := date_trunc('month', _end_date)::date;

  SELECT * INTO v_contract
    FROM public.contracts
   WHERE child_id = _child_id
     AND status IN ('confirmed','generated','signed','sent','draft')
   ORDER BY (status = 'draft'), updated_at DESC
   LIMIT 1;

  IF FOUND THEN
    -- completed → completed (when end_date reached), moved/withdrew/other → cancelled.
    v_new_contract_status := CASE
      WHEN _reason_code = 'completed' AND _end_date <= v_today THEN 'completed'::public.contract_status
      WHEN _reason_code IN ('moved','withdrew','other') THEN 'cancelled'::public.contract_status
      ELSE v_contract.status
    END;

    UPDATE public.contracts
       SET end_date = COALESCE(LEAST(end_date, _end_date), _end_date),
           status = v_new_contract_status,
           updated_at = now()
     WHERE id = v_contract.id;

    -- Cancel future fully-unpaid charges only. Preserve partial/paid/historical.
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
      'reason_code', _reason_code,
      'reason', _reason,      -- legacy free-text (kept for compatibility)
      'note', _note,          -- new optional structured note
      'from', v_child.status,
      'to', v_new_child_status,
      'contract_status_to', v_new_contract_status,
      'charges_cancelled', v_cancelled
    ),
    v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'charges_cancelled', v_cancelled,
    'contract_id', v_contract.id,
    'child_status', v_new_child_status,
    'contract_status', v_new_contract_status,
    'contract_closed', (v_contract.id IS NOT NULL AND v_new_contract_status IN ('completed','cancelled'))
  );
END $$;

-- Admin/manager-only correction: reopen a graduated/archived departure.
-- Restores an active status, clears end_date, reopens the contract.
-- Does NOT recreate cancelled charges; the audit event flags that billing
-- must be reviewed/re-generated explicitly.
CREATE OR REPLACE FUNCTION public.reopen_child_attendance(
  _child_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_child public.children%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_prev_child_status public.child_status;
  v_prev_contract_status public.contract_status;
  v_new_contract_status public.contract_status;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT (public.has_role(v_actor, 'admin'::public.app_role)
       OR public.has_role(v_actor, 'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Лише адміністратор або менеджер може відновлювати відвідування';
  END IF;

  SELECT * INTO v_child FROM public.children WHERE id = _child_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дитину не знайдено'; END IF;
  IF v_child.status NOT IN ('graduated','archived') THEN
    RAISE EXCEPTION 'Відвідування не завершено — немає що відновлювати';
  END IF;

  v_prev_child_status := v_child.status;

  UPDATE public.children
     SET end_date = NULL,
         status = 'active'::public.child_status,
         updated_at = now()
   WHERE id = _child_id;

  SELECT * INTO v_contract
    FROM public.contracts
   WHERE child_id = _child_id
   ORDER BY updated_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_prev_contract_status := v_contract.status;
    -- Choose a safe active status. If it was closed by departure, reopen to
    -- 'confirmed' when charges already existed, otherwise 'draft'.
    IF v_contract.status IN ('completed','cancelled') THEN
      IF EXISTS (SELECT 1 FROM public.charges WHERE contract_id = v_contract.id) THEN
        v_new_contract_status := 'confirmed'::public.contract_status;
      ELSE
        v_new_contract_status := 'draft'::public.contract_status;
      END IF;
    ELSE
      v_new_contract_status := v_contract.status;
    END IF;

    UPDATE public.contracts
       SET end_date = NULL,
           status = v_new_contract_status,
           updated_at = now()
     WHERE id = v_contract.id;
  END IF;

  INSERT INTO public.timeline_events(client_id, branch_id, contract_id, type, payload, actor_id)
  VALUES (
    v_child.client_id,
    v_child.branch_id,
    v_contract.id,
    'status_changed',
    jsonb_build_object(
      'kind', 'child_reopened',
      'child_id', _child_id,
      'child_name', trim(coalesce(v_child.first_name,'') || ' ' || coalesce(v_child.last_name,'')),
      'from', v_prev_child_status,
      'to', 'active',
      'contract_status_from', v_prev_contract_status,
      'contract_status_to', v_new_contract_status,
      'note', _note,
      'billing_review_required', true
    ),
    v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'child_status', 'active',
    'contract_id', v_contract.id,
    'contract_status', v_new_contract_status,
    'billing_review_required', true
  );
END $$;
