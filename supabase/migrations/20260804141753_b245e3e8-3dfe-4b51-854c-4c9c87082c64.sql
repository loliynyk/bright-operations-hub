ALTER TYPE public.child_status ADD VALUE IF NOT EXISTS 'pending_start';
ALTER TYPE public.child_status ADD VALUE IF NOT EXISTS 'not_started';

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS not_started_at date,
  ADD COLUMN IF NOT EXISTS not_started_reason text,
  ADD COLUMN IF NOT EXISTS source_lead_child_id uuid;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS parent_patronymic text,
  ADD COLUMN IF NOT EXISTS parent_birth_date date,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS registered_address text,
  ADD COLUMN IF NOT EXISTS actual_address text,
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS doc_series text,
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS doc_record_number text,
  ADD COLUMN IF NOT EXISTS doc_issuer text,
  ADD COLUMN IF NOT EXISTS doc_issue_date date,
  ADD COLUMN IF NOT EXISTS doc_expiry_date date;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_lead_contract_id uuid;