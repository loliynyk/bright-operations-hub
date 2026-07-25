ALTER FUNCTION public.adjust_charge(uuid, numeric, text) SECURITY INVOKER;
ALTER FUNCTION public.recompute_charge_status(uuid) SECURITY INVOKER;