-- Ensure every current status value has a matching row in lead_statuses so the FK holds.
INSERT INTO public.lead_statuses (code, label, tone, sort_order, is_active, is_system)
SELECT DISTINCT l.status::text, l.status::text, 'bg-muted text-foreground', 999, true, false
FROM public.leads l
WHERE NOT EXISTS (SELECT 1 FROM public.lead_statuses s WHERE s.code = l.status::text);

-- Convert leads.status from lead_status enum to text, preserving values and defaults.
ALTER TABLE public.leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE public.leads ALTER COLUMN status SET NOT NULL;

-- Enforce that leads.status references a configured lead_statuses.code.
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_fkey
  FOREIGN KEY (status) REFERENCES public.lead_statuses(code)
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE;
