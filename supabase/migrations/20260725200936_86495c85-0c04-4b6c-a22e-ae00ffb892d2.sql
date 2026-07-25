
-- 1. Helper functions -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role,'manager'::app_role)
  )
$$;

-- 2. Lock SECURITY DEFINER functions to authenticated only ------------------
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_lead_to_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client(uuid) TO authenticated;

-- 3. Bootstrap: give every existing auth user Admin so nothing breaks -------
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

-- 4. Replace permissive table policies --------------------------------------
-- Data tables (staff-only, any assigned role)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'charges','children','client_attachments','clients','contracts',
    'employees','expenses','leads','payments','timeline_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_all_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_delete ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all ON public.%I', t);
    EXECUTE format($f$CREATE POLICY staff_select ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY staff_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY staff_update ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY staff_delete ON public.%I FOR DELETE TO authenticated USING (public.has_any_role(auth.uid()))$f$, t);
  END LOOP;
END $$;

-- Config tables: everyone with a role can read; only admin/manager can write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','services','subscription_plans','price_versions','discounts','groups'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_all_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_delete ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all ON public.%I', t);
    EXECUTE format($f$CREATE POLICY staff_select ON public.%I FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_update ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY admin_delete ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()))$f$, t);
  END LOOP;
END $$;

-- 5. Contracts storage bucket: staff-only, path must reference a real client
DROP POLICY IF EXISTS "contracts bucket read" ON storage.objects;
DROP POLICY IF EXISTS "contracts bucket insert" ON storage.objects;
DROP POLICY IF EXISTS "contracts bucket update" ON storage.objects;
DROP POLICY IF EXISTS "contracts bucket delete" ON storage.objects;

CREATE POLICY "contracts bucket read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'contracts'
  AND public.has_any_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = split_part(storage.objects.name, '/', 1)
  )
);

CREATE POLICY "contracts bucket insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contracts'
  AND public.is_admin_or_manager(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = split_part(name, '/', 1)
  )
);

CREATE POLICY "contracts bucket update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'contracts'
  AND public.is_admin_or_manager(auth.uid())
)
WITH CHECK (
  bucket_id = 'contracts'
  AND public.is_admin_or_manager(auth.uid())
);

CREATE POLICY "contracts bucket delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'contracts'
  AND public.is_admin_or_manager(auth.uid())
);
