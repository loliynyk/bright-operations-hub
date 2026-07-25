
-- Convert role helpers to SECURITY INVOKER (user_roles has a self-select policy)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin'::app_role,'manager'::app_role))
$$;

-- Tighten remaining always-true policies on lookup tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','expense_categories'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_all ON public.%I', t);
    EXECUTE format($f$CREATE POLICY staff_select ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_update ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_delete ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()))$f$, t);
  END LOOP;
END $$;

-- Ensure convert_lead_to_client explicitly rejects unauthenticated callers
CREATE OR REPLACE FUNCTION public.convert_lead_to_client(_lead_id uuid)
 RETURNS TABLE(client_id uuid, child_id uuid, contract_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_child_id uuid;
  v_contract_id uuid;
  v_start date;
  v_parent_first text;
  v_parent_last text;
  v_child_first text;
  v_child_last text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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

  v_start := COALESCE(v_lead.desired_start_date, CURRENT_DATE);

  INSERT INTO public.contracts(branch_id, client_id, child_id, service_id,
                               monthly_price, start_date, status, created_by, number)
  VALUES (v_lead.branch_id, v_client_id, v_child_id, v_lead.service_id,
          0, v_start, 'draft', v_actor,
          'C-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6))
  RETURNING id INTO v_contract_id;

  UPDATE public.leads SET status = 'converted', converted_client_id = v_client_id, updated_at = now()
   WHERE id = v_lead.id;

  INSERT INTO public.timeline_events(lead_id, client_id, type, payload, actor_id)
    VALUES (v_lead.id, v_client_id, 'status_changed', jsonb_build_object('from', v_lead.status, 'to', 'converted'), v_actor);
  INSERT INTO public.timeline_events(lead_id, client_id, type, payload, actor_id)
    VALUES (v_lead.id, v_client_id, 'client_created', '{}'::jsonb, v_actor);
  INSERT INTO public.timeline_events(client_id, contract_id, type, payload, actor_id)
    VALUES (v_client_id, v_contract_id, 'contract_generated', jsonb_build_object('status','draft'), v_actor);

  RETURN QUERY SELECT v_client_id, v_child_id, v_contract_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_lead_to_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client(uuid) TO authenticated;
