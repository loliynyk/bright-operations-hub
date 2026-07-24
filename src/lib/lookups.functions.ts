import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [branches, services, plans, prices, discounts, groups] = await Promise.all([
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
      supabase.from("services").select("id, name, branch_id").eq("is_active", true).order("name"),
      supabase.from("subscription_plans").select("id, name").eq("is_active", true).order("name"),
      supabase.from("price_versions").select("id, name, plan_id, monthly_price").eq("is_active", true).order("name"),
      supabase.from("discounts").select("id, name, type, value").eq("is_active", true).order("name"),
      supabase.from("groups").select("id, name, branch_id").eq("is_active", true).order("name"),
    ]);
    return {
      branches: branches.data ?? [],
      services: services.data ?? [],
      plans: plans.data ?? [],
      prices: prices.data ?? [],
      discounts: discounts.data ?? [],
      groups: groups.data ?? [],
    };
  });
