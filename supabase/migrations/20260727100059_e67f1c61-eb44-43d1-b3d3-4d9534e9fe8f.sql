
-- Groups: keep age_range text; add numeric age_from/age_to
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS age_from int;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS age_to int;

-- Payment methods: branch scope + type classifier
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS type text;

-- Discounts: optional validity window
ALTER TABLE public.discounts ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE public.discounts ADD COLUMN IF NOT EXISTS valid_to date;

-- Expense categories: optional branch scope (NULL = global)
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Prevent changing price on a price_version already used by a confirmed/generated/signed/sent contract
CREATE OR REPLACE FUNCTION public.tg_price_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.monthly_price IS DISTINCT FROM OLD.monthly_price THEN
    IF EXISTS (
      SELECT 1 FROM public.contracts
       WHERE price_version_id = OLD.id
         AND status IN ('confirmed','generated','signed','sent')
    ) THEN
      RAISE EXCEPTION 'Ціна вже використовується у підтверджених договорах; створіть нову версію ціни';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS price_version_guard ON public.price_versions;
CREATE TRIGGER price_version_guard
  BEFORE UPDATE ON public.price_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_price_version_guard();
