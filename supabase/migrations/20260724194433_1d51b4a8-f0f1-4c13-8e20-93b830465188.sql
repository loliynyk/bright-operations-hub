
-- =========================================================================
-- Enums
-- =========================================================================
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'waiting';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'trial';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'contract';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'converted';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'archived';

DO $$ BEGIN
  CREATE TYPE public.client_status AS ENUM ('active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.child_status AS ENUM ('active','paused','graduated','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM ('draft','generated','sent','signed','cancelled','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.discount_type AS ENUM ('percentage','fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.charge_status AS ENUM ('pending','paid','partial','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.timeline_event_type AS ENUM (
    'lead_created','status_changed','client_created','contract_generated',
    'pdf_generated','charges_generated','note_added'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- Leads: extend
-- =========================================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service_id uuid,
  ADD COLUMN IF NOT EXISTS source_form text,
  ADD COLUMN IF NOT EXISTS registration_date date DEFAULT (now()::date),
  ADD COLUMN IF NOT EXISTS parent_first_name text,
  ADD COLUMN IF NOT EXISTS parent_last_name text,
  ADD COLUMN IF NOT EXISTS parent_address text,
  ADD COLUMN IF NOT EXISTS child_first_name text,
  ADD COLUMN IF NOT EXISTS child_last_name text,
  ADD COLUMN IF NOT EXISTS desired_start_date date,
  ADD COLUMN IF NOT EXISTS trial_date timestamptz,
  ADD COLUMN IF NOT EXISTS converted_client_id uuid;

-- =========================================================================
-- Fix profiles: only self or admin/manager
-- =========================================================================
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by self or staff leads"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

-- =========================================================================
-- Fix leads: restrict read to owners / assignees / admin+manager
-- =========================================================================
DROP POLICY IF EXISTS "Leads read authenticated" ON public.leads;
CREATE POLICY "Leads read scoped"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  );

-- =========================================================================
-- has_role: revoke public execute
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- =========================================================================
-- Helper: shared updated_at trigger already exists as tg_set_updated_at
-- =========================================================================

-- =========================================================================
-- services
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services read" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "services manage" ON public.services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER services_updated BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- subscription_plans
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans read" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans manage" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER subscription_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- price_versions
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.price_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  monthly_price numeric(12,2) NOT NULL,
  valid_from date NOT NULL DEFAULT (now()::date),
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_versions TO authenticated;
GRANT ALL ON public.price_versions TO service_role;
ALTER TABLE public.price_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prices read" ON public.price_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "prices manage" ON public.price_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER price_versions_updated BEFORE UPDATE ON public.price_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- discounts
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.discount_type NOT NULL,
  value numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discounts TO authenticated;
GRANT ALL ON public.discounts TO service_role;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discounts read" ON public.discounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "discounts manage" ON public.discounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER discounts_updated BEFORE UPDATE ON public.discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- groups
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_range text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups read" ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups manage" ON public.groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER groups_updated BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- clients
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  parent_first_name text NOT NULL,
  parent_last_name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  status public.client_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients read staff" ON public.clients FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant')
    OR created_by = auth.uid()
  );
CREATE POLICY "clients insert staff" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant')
  );
CREATE POLICY "clients update staff" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR created_by = auth.uid());
CREATE POLICY "clients delete admin" ON public.clients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FK from leads.converted_client_id
ALTER TABLE public.leads
  ADD CONSTRAINT leads_converted_client_fk
  FOREIGN KEY (converted_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_service_fk
  FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

-- =========================================================================
-- children
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text,
  birth_date date,
  status public.child_status NOT NULL DEFAULT 'active',
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.children TO authenticated;
GRANT ALL ON public.children TO service_role;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
CREATE POLICY "children read staff" ON public.children FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant')
);
CREATE POLICY "children manage staff" ON public.children FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'teacher'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'teacher'));
CREATE TRIGGER children_updated BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- contracts
-- =========================================================================
CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq START 1000;

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE DEFAULT ('BR-' || nextval('public.contract_number_seq')::text),
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  price_version_id uuid REFERENCES public.price_versions(id) ON DELETE SET NULL,
  discount_id uuid REFERENCES public.discounts(id) ON DELETE SET NULL,
  manual_discount numeric(12,2) NOT NULL DEFAULT 0,
  monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT (now()::date),
  end_date date,
  status public.contract_status NOT NULL DEFAULT 'draft',
  comment text,
  pdf_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
GRANT USAGE ON SEQUENCE public.contract_number_seq TO authenticated, service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts read staff" ON public.contracts FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid()
);
CREATE POLICY "contracts manage staff" ON public.contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid());
CREATE TRIGGER contracts_updated BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- charges
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric(12,2) NOT NULL,
  status public.charge_status NOT NULL DEFAULT 'pending',
  is_prorated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charges read staff" ON public.charges FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant')
);
CREATE POLICY "charges manage staff" ON public.charges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));
CREATE TRIGGER charges_updated BEFORE UPDATE ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- client_attachments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.client_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  name text NOT NULL,
  url text NOT NULL,
  mime text,
  size integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_attachments TO authenticated;
GRANT ALL ON public.client_attachments TO service_role;
ALTER TABLE public.client_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments read staff" ON public.client_attachments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid()
);
CREATE POLICY "attachments manage staff" ON public.client_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant') OR created_by = auth.uid());

-- =========================================================================
-- timeline_events
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  type public.timeline_event_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline read staff" ON public.timeline_events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant')
  OR actor_id = auth.uid()
);
CREATE POLICY "timeline insert staff" ON public.timeline_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'accountant')
  );

CREATE INDEX IF NOT EXISTS idx_timeline_lead ON public.timeline_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_client ON public.timeline_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_children_client ON public.children(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_charges_contract ON public.charges(contract_id, period_month);
