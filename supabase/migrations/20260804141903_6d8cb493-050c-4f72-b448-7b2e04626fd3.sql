-- ---------- STORAGE SECURITY ----------
CREATE POLICY "lead contracts read admins" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-contracts' AND public.is_admin_or_manager(auth.uid()));
CREATE POLICY "lead contracts upload admins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-contracts' AND public.is_admin_or_manager(auth.uid()));
CREATE POLICY "lead contracts update admins" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-contracts' AND public.is_admin_or_manager(auth.uid()));

-- ---------- ATOMIC CONVERSION ----------
CREATE OR REPLACE FUNCTION public.convert_lead_to_client_v2(
  _lead_id uuid,
  _existing_client_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead        public.leads%ROWTYPE;
  v_legal       public.lead_legal_data%ROWTYPE;
  v_lc          public.lead_contracts%ROWTYPE;
  v_client_id   uuid;
  v_child       record;
  v_child_id    uuid;
  v_contract_id uuid;
  v_first_contract uuid;
  v_kids        int;
  v_actor       uuid := auth.uid();
  v_num         text;
  v_child_ids   uuid[] := '{}';
BEGIN
  IF NOT public.is_admin_or_manager(v_actor) THEN
    RAISE EXCEPTION 'Недостатньо прав для конвертації ліда';
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Лід не знайдено'; END IF;
  IF v_lead.status = 'converted' OR v_lead.converted_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Лід уже конвертовано';
  END IF;

  SELECT * INTO v_legal FROM public.lead_legal_data WHERE lead_id = _lead_id;

  -- ---- requirement checks ----
  IF coalesce(btrim(v_lead.parent_first_name), '') = ''
     OR coalesce(btrim(v_lead.parent_last_name), '') = '' THEN
    RAISE EXCEPTION 'Потрібні ім''я та прізвище представника';
  END IF;
  IF coalesce(btrim(v_lead.parent_phone), '') = '' THEN
    RAISE EXCEPTION 'Потрібен телефон представника';
  END IF;
  IF v_lead.parent_email IS NULL OR v_lead.parent_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Потрібен коректний email представника';
  END IF;
  IF v_lead.branch_id IS NULL THEN
    RAISE EXCEPTION 'Потрібна локація (філія)';
  END IF;

  SELECT count(*) INTO v_kids FROM public.lead_children WHERE lead_id = _lead_id;
  IF v_kids = 0 THEN RAISE EXCEPTION 'Потрібна щонайменше одна дитина'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lead_children
     WHERE lead_id = _lead_id
       AND (coalesce(btrim(first_name),'') = '' OR coalesce(btrim(last_name),'') = ''
            OR birth_date IS NULL OR planned_start_date IS NULL
            OR final_price IS NULL)
  ) THEN
    RAISE EXCEPTION 'У кожної дитини мають бути ПІБ, дата народження, планована дата початку та фінальна ціна';
  END IF;

  SELECT * INTO v_lc FROM public.lead_contracts WHERE lead_id = _lead_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Потрібен договір, прикріплений до ліда'; END IF;
  IF v_lc.status <> 'final' THEN RAISE EXCEPTION 'Договір має бути фіналізований'; END IF;
  IF v_lc.signed_date IS NULL THEN RAISE EXCEPTION 'Потрібна зафіксована дата підписання'; END IF;

  -- ---- client ----
  IF _existing_client_id IS NOT NULL THEN
    SELECT id INTO v_client_id FROM public.clients WHERE id = _existing_client_id;
    IF v_client_id IS NULL THEN RAISE EXCEPTION 'Обраного клієнта не знайдено'; END IF;
    UPDATE public.clients SET
      lead_id = _lead_id,
      phone = coalesce(phone, v_lead.parent_phone),
      email = coalesce(email, v_lead.parent_email)
    WHERE id = v_client_id;
  ELSE
    INSERT INTO public.clients (
      branch_id, lead_id, parent_first_name, parent_last_name, parent_patronymic,
      phone, email, address, parent_birth_date, tax_id, registered_address, actual_address,
      doc_type, doc_series, doc_number, doc_record_number, doc_issuer, doc_issue_date, doc_expiry_date,
      status, created_by
    ) VALUES (
      v_lead.branch_id, _lead_id,
      coalesce(v_legal.first_name, v_lead.parent_first_name),
      coalesce(v_legal.last_name, v_lead.parent_last_name),
      v_legal.patronymic,
      v_lead.parent_phone, v_lead.parent_email,
      coalesce(v_legal.actual_address, v_lead.parent_address),
      v_legal.birth_date, v_legal.tax_id, v_legal.registered_address,
      CASE WHEN v_legal.same_address THEN v_legal.registered_address ELSE v_legal.actual_address END,
      v_legal.doc_type, v_legal.doc_series, v_legal.doc_number, v_legal.doc_record_number,
      v_legal.doc_issuer, v_legal.doc_issue_date, v_legal.doc_expiry_date,
      'active', v_actor
    ) RETURNING id INTO v_client_id;
  END IF;

  -- ---- children + contracts ----
  FOR v_child IN
    SELECT * FROM public.lead_children WHERE lead_id = _lead_id ORDER BY sort_order, created_at
  LOOP
    INSERT INTO public.children (
      client_id, branch_id, group_id, first_name, last_name, birth_date,
      status, planned_start_date, source_lead_child_id
    ) VALUES (
      v_client_id, coalesce(v_child.branch_id, v_lead.branch_id), v_child.group_id,
      v_child.first_name, v_child.last_name, v_child.birth_date,
      'pending_start', v_child.planned_start_date, v_child.id
    ) RETURNING id INTO v_child_id;

    v_child_ids := v_child_ids || v_child_id;
    UPDATE public.lead_children SET converted_child_id = v_child_id WHERE id = v_child.id;

    v_num := coalesce(nullif(btrim(v_lc.number), ''), 'L-' || substr(_lead_id::text, 1, 8))
             || CASE WHEN v_kids > 1 THEN '/' || array_length(v_child_ids, 1)::text ELSE '' END;

    INSERT INTO public.contracts (
      branch_id, client_id, child_id, number, service_id, plan_id, price_version_id,
      monthly_price, start_date, status, comment, created_by, confirmed_at,
      source_lead_contract_id
    ) VALUES (
      coalesce(v_child.branch_id, v_lead.branch_id), v_client_id, v_child_id, v_num,
      coalesce(v_child.service_id, v_lead.service_id), v_child.plan_id, v_child.price_version_id,
      v_child.final_price, v_child.planned_start_date, 'signed',
      v_child.discount_reason, v_actor, now(), v_lc.id
    ) RETURNING id INTO v_contract_id;

    IF v_first_contract IS NULL THEN v_first_contract := v_contract_id; END IF;

    INSERT INTO public.timeline_events (branch_id, client_id, contract_id, lead_id, type, actor_id, payload)
    VALUES (v_lead.branch_id, v_client_id, v_contract_id, _lead_id, 'contract_generated', v_actor,
            jsonb_build_object('child_id', v_child_id, 'source', 'lead_conversion'));
  END LOOP;

  -- ---- link the SAME lead contract record ----
  UPDATE public.lead_contracts
     SET linked_client_id = v_client_id, linked_contract_id = v_first_contract
   WHERE id = v_lc.id;

  -- ---- close the lead ----
  UPDATE public.leads
     SET status = 'converted', converted_client_id = v_client_id, converted_at = now()
   WHERE id = _lead_id;

  INSERT INTO public.timeline_events (branch_id, lead_id, client_id, type, actor_id, payload)
  VALUES (v_lead.branch_id, _lead_id, v_client_id, 'client_created', v_actor,
          jsonb_build_object('children', array_length(v_child_ids, 1), 'lead_contract_id', v_lc.id));

  RETURN jsonb_build_object(
    'client_id', v_client_id,
    'child_ids', to_jsonb(v_child_ids),
    'contract_id', v_first_contract,
    'lead_contract_id', v_lc.id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.convert_lead_to_client_v2(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client_v2(uuid, uuid) TO authenticated;

-- ---------- CHILD START LIFECYCLE ----------
CREATE OR REPLACE FUNCTION public.start_child_attendance(_child_id uuid, _actual_start date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.children%ROWTYPE;
BEGIN
  IF NOT public.is_admin_or_manager(v_actor) THEN RAISE EXCEPTION 'Недостатньо прав'; END IF;
  SELECT * INTO v_row FROM public.children WHERE id = _child_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дитину не знайдено'; END IF;
  IF v_row.status <> 'pending_start' THEN RAISE EXCEPTION 'Дитина не в статусі «Очікує початку»'; END IF;
  UPDATE public.children
     SET status = 'active', actual_start_date = _actual_start, start_date = _actual_start
   WHERE id = _child_id;
  INSERT INTO public.timeline_events (branch_id, client_id, type, actor_id, payload)
  VALUES (v_row.branch_id, v_row.client_id, 'status_changed', v_actor,
          jsonb_build_object('child_id', _child_id, 'to', 'active', 'actual_start_date', _actual_start));
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.start_child_attendance(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_child_attendance(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_child_not_started(_child_id uuid, _cancel_date date, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.children%ROWTYPE; v_cancelled int;
BEGIN
  IF NOT public.is_admin_or_manager(v_actor) THEN RAISE EXCEPTION 'Недостатньо прав'; END IF;
  IF coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Потрібна причина'; END IF;
  SELECT * INTO v_row FROM public.children WHERE id = _child_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Дитину не знайдено'; END IF;
  IF v_row.status <> 'pending_start' THEN RAISE EXCEPTION 'Доступно лише для статусу «Очікує початку»'; END IF;

  UPDATE public.children
     SET status = 'not_started', not_started_at = _cancel_date, not_started_reason = _reason,
         end_date = _cancel_date
   WHERE id = _child_id;

  UPDATE public.charges c SET status = 'cancelled'
    FROM public.contracts ct
   WHERE c.contract_id = ct.id AND ct.child_id = _child_id
     AND c.paid_amount = 0 AND c.status IN ('pending','overdue');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.contracts SET status = 'cancelled' WHERE child_id = _child_id AND status <> 'cancelled';

  INSERT INTO public.timeline_events (branch_id, client_id, type, actor_id, payload)
  VALUES (v_row.branch_id, v_row.client_id, 'status_changed', v_actor,
          jsonb_build_object('child_id', _child_id, 'to', 'not_started',
                             'cancel_date', _cancel_date, 'reason', _reason,
                             'charges_cancelled', v_cancelled));
  RETURN jsonb_build_object('ok', true, 'charges_cancelled', v_cancelled);
END; $$;
REVOKE ALL ON FUNCTION public.mark_child_not_started(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_child_not_started(uuid, date, text) TO authenticated;