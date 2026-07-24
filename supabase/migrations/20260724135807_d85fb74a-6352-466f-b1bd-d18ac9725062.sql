
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Leads insert authenticated" ON public.leads;
DROP POLICY IF EXISTS "Leads update authenticated" ON public.leads;

CREATE POLICY "Staff insert leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'accountant')
    OR auth.uid() = created_by
  );
CREATE POLICY "Staff update leads" ON public.leads FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid() OR created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
    OR assigned_to = auth.uid() OR created_by = auth.uid()
  );
