import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLookups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [branches, services, plans, prices, discounts, groups, methods, expenseCats, incomeCats] =
      await Promise.all([
        supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
        supabase.from("services").select("id, name, branch_id").eq("is_active", true).order("name"),
        supabase.from("subscription_plans").select("id, name").eq("is_active", true).order("name"),
        supabase.from("price_versions").select("id, name, plan_id, monthly_price, valid_from, valid_to").eq("is_active", true).order("valid_from", { ascending: false }),
        supabase.from("discounts").select("id, name, type, value").eq("is_active", true).order("name"),
        supabase.from("groups").select("id, name, branch_id").eq("is_active", true).order("name"),
        supabase.from("payment_methods").select("id, name, type, branch_id").eq("is_active", true).order("name"),
        supabase.from("expense_categories").select("id, name, branch_id").eq("is_active", true).order("name"),
        supabase.from("income_categories").select("id, name").eq("is_active", true).order("name"),
      ]);
    return {
      branches: branches.data ?? [],
      services: services.data ?? [],
      plans: plans.data ?? [],
      prices: prices.data ?? [],
      discounts: discounts.data ?? [],
      groups: groups.data ?? [],
      paymentMethods: methods.data ?? [],
      expenseCategories: expenseCats.data ?? [],
      incomeCategories: incomeCats.data ?? [],
    };
  });
