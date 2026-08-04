-- ---------- LEGAL DATA (restricted) ----------
CREATE TABLE public.lead_legal_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  last_name text,
  first_name text,
  patronymic text,
  birth_date date,
  tax_id text,
  registered_address text,
  actual_address text,
  same_address boolean NOT NULL DEFAULT false,
  doc_type text,
  doc_series text,
  doc_number text,
  doc_record_number text,
  doc_issuer text,
  doc_issue_date date,
  doc_expiry_date date,
  doc_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_legal_doc_type_chk CHECK (
    doc_type IS NULL OR doc_type IN ('passport_book','id_card','international_passport','residence_permit','other')
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_legal_data TO authenticated;
GRANT ALL ON public.lead_legal_data TO service_role;
ALTER TABLE public.lead_legal_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal read admins" ON public.lead_legal_data FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "legal write admins" ON public.lead_legal_data FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "legal update admins" ON public.lead_legal_data FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "legal delete admins" ON public.lead_legal_data FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_lead_legal_updated BEFORE UPDATE ON public.lead_legal_data
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- CHILDREN ON A LEAD (incl. tariff snapshot) ----------
CREATE TABLE public.lead_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  last_name text,
  first_name text NOT NULL,
  patronymic text,
  birth_date date,
  gender text,
  planned_start_date date,
  branch_id uuid REFERENCES public.branches(id),
  group_id uuid REFERENCES public.groups(id),
  service_id uuid REFERENCES public.services(id),
  notes text,
  -- tariff snapshot (frozen at agreement time)
  plan_id uuid REFERENCES public.subscription_plans(id),
  price_version_id uuid REFERENCES public.price_versions(id),
  base_price numeric(12,2),
  discount_type text,
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  discount_reason text,
  final_price numeric(12,2),
  agreed_at date,
  approved_by uuid,
  converted_child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_children_gender_chk CHECK (gender IS NULL OR gender IN ('male','female','other')),
  CONSTRAINT lead_children_discount_type_chk CHECK (discount_type IS NULL OR discount_type IN ('percentage','fixed')),
  CONSTRAINT lead_children_final_price_chk CHECK (final_price IS NULL OR final_price >= 0),
  CONSTRAINT lead_children_discount_reason_chk CHECK (
    discount_value = 0 OR (discount_reason IS NOT NULL AND length(btrim(discount_reason)) > 0)
  )
);
CREATE INDEX idx_lead_children_lead ON public.lead_children(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_children TO authenticated;
GRANT ALL ON public.lead_children TO service_role;
ALTER TABLE public.lead_children ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead children read" ON public.lead_children FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "lead children insert" ON public.lead_children FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "lead children update" ON public.lead_children FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "lead children delete" ON public.lead_children FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_lead_children_updated BEFORE UPDATE ON public.lead_children
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- CONTRACT FILE ON A LEAD ----------
CREATE TABLE public.lead_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  number text,
  contract_date date,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT true,
  draft_path text,
  draft_filename text,
  draft_mime text,
  draft_size integer,
  final_path text,
  final_filename text,
  final_mime text,
  final_size integer,
  signed_path text,
  signed_filename text,
  signed_mime text,
  signed_size integer,
  uploaded_by uuid,
  uploaded_at timestamptz,
  finalized_by uuid,
  finalized_at timestamptz,
  sent_by uuid,
  sent_at timestamptz,
  sent_to_email text,
  email_subject text,
  email_body text,
  email_result text,
  email_error text,
  signed_date date,
  signature_recorded_by uuid,
  signature_recorded_at timestamptz,
  signature_is_physical boolean NOT NULL DEFAULT false,
  signature_comment text,
  linked_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  linked_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_contracts_status_chk CHECK (status IN ('draft','final'))
);
CREATE UNIQUE INDEX idx_lead_contracts_one_active ON public.lead_contracts(lead_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contracts TO authenticated;
GRANT ALL ON public.lead_contracts TO service_role;
ALTER TABLE public.lead_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead contracts read" ON public.lead_contracts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "lead contracts insert" ON public.lead_contracts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "lead contracts update" ON public.lead_contracts FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "lead contracts delete" ON public.lead_contracts FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_lead_contracts_updated BEFORE UPDATE ON public.lead_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- file version history so replacing a draft never loses the previous file
CREATE TABLE public.lead_contract_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_contract_id uuid NOT NULL REFERENCES public.lead_contracts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  path text NOT NULL,
  filename text,
  mime text,
  size integer,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_contract_files_kind_chk CHECK (kind IN ('draft','final','signed'))
);
CREATE INDEX idx_lead_contract_files_parent ON public.lead_contract_files(lead_contract_id);
GRANT SELECT, INSERT ON public.lead_contract_files TO authenticated;
GRANT ALL ON public.lead_contract_files TO service_role;
ALTER TABLE public.lead_contract_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead contract files read" ON public.lead_contract_files FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "lead contract files insert" ON public.lead_contract_files FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- ---------- CONTACT ATTEMPTS ----------
CREATE TABLE public.lead_contact_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text NOT NULL,
  outcome text NOT NULL,
  notes text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_contact_channel_chk CHECK (channel IN ('call','sms','messenger','email','other')),
  CONSTRAINT lead_contact_outcome_chk CHECK (outcome IN ('reached','no_answer','wrong_number','declined','other'))
);
CREATE INDEX idx_lead_contact_attempts_lead ON public.lead_contact_attempts(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contact_attempts TO authenticated;
GRANT ALL ON public.lead_contact_attempts TO service_role;
ALTER TABLE public.lead_contact_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts read" ON public.lead_contact_attempts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "attempts insert" ON public.lead_contact_attempts FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "attempts update" ON public.lead_contact_attempts FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "attempts delete" ON public.lead_contact_attempts FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- ---------- LEAD LIFECYCLE COLUMNS ----------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS preferred_channel text,
  ADD COLUMN IF NOT EXISTS visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_note text,
  ADD COLUMN IF NOT EXISTS contact_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close_reason_code text,
  ADD COLUMN IF NOT EXISTS close_reason_comment text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_preferred_channel_chk
    CHECK (preferred_channel IS NULL OR preferred_channel IN ('phone','sms','messenger','email'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_close_reason_chk
    CHECK (close_reason_code IS NULL OR close_reason_code IN (
      'price','location','chose_other','format_conditions','group_schedule','changed_mind',
      'no_space','age','needs','unreachable','duplicate','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;