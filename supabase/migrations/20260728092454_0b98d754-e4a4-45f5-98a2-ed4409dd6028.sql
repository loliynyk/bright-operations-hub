
-- Intake form registrations
CREATE TABLE public.lead_intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  requested_plan text,
  external_form_id text NOT NULL,
  external_sheet_id text,
  source_form text NOT NULL,
  secret_hash text NOT NULL,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lead_intake_forms_external_form_id_key
  ON public.lead_intake_forms(external_form_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_intake_forms TO authenticated;
GRANT ALL ON public.lead_intake_forms TO service_role;

ALTER TABLE public.lead_intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_forms_staff_read"
  ON public.lead_intake_forms FOR SELECT
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "intake_forms_staff_write"
  ON public.lead_intake_forms FOR ALL
  TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER trg_lead_intake_forms_updated_at
  BEFORE UPDATE ON public.lead_intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Intake event log
CREATE TABLE public.lead_intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_form_id uuid NOT NULL REFERENCES public.lead_intake_forms(id) ON DELETE CASCADE,
  external_response_id text NOT NULL,
  submitted_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('received','created','duplicate','rejected','error')),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  duplicate_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lead_intake_events_form_response_key
  ON public.lead_intake_events(intake_form_id, external_response_id);
CREATE INDEX lead_intake_events_form_created_at_idx
  ON public.lead_intake_events(intake_form_id, created_at DESC);

GRANT SELECT ON public.lead_intake_events TO authenticated;
GRANT ALL ON public.lead_intake_events TO service_role;

ALTER TABLE public.lead_intake_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_events_staff_read"
  ON public.lead_intake_events FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid()));
