import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: any) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => r === "admin" || r === "manager")) {
    throw new Error("Недостатньо прав");
  }
}

// -------- Groups --------
export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("groups").select("*").order("name");
    if (data?.branchId) q = q.eq("branch_id", data.branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const GroupSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  name: z.string().min(1),
  age_range: z.string().optional().nullable(),
  age_from: z.number().int().nullable().optional(),
  age_to: z.number().int().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("groups").upsert(data).select().single();
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("groups").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Services --------
export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("services").select("*").order("name");
    if (data?.branchId) q = q.eq("branch_id", data.branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ServiceSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ServiceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("services").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("services").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Plans + Prices --------
export const listPlansWithPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("subscription_plans").select("*").order("name");
    if (data?.branchId) q = q.or(`branch_id.eq.${data.branchId},branch_id.is.null`);
    const { data: plans, error } = await q;
    if (error) throw new Error(error.message);
    const { data: prices, error: pe } = await context.supabase
      .from("price_versions").select("*").order("valid_from", { ascending: false });
    if (pe) throw new Error(pe.message);
    return { plans: plans ?? [], prices: prices ?? [] };
  });

const PlanSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("subscription_plans").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archivePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("subscription_plans").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PriceSchema = z.object({
  id: z.string().uuid().optional(),
  plan_id: z.string().uuid(),
  name: z.string().min(1),
  monthly_price: z.number().nonnegative(),
  valid_from: z.string(),
  valid_to: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PriceSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Naive overlap check for active periods
    if (data.is_active) {
      const { data: existing } = await context.supabase
        .from("price_versions").select("id, valid_from, valid_to")
        .eq("plan_id", data.plan_id).eq("is_active", true);
      for (const r of existing ?? []) {
        if (data.id && r.id === data.id) continue;
        const aFrom = data.valid_from;
        const aTo = data.valid_to ?? "9999-12-31";
        const bFrom = r.valid_from;
        const bTo = r.valid_to ?? "9999-12-31";
        if (aFrom <= bTo && bFrom <= aTo) {
          throw new Error("Період перетинається з існуючою активною версією ціни");
        }
      }
    }
    const { error } = await context.supabase.from("price_versions").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archivePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("price_versions").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Discounts --------
export const listDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("discounts").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const DiscountSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().nonnegative(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DiscountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.type === "percentage" && data.value > 100) throw new Error("Відсоток не може перевищувати 100");
    const { error } = await context.supabase.from("discounts").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("discounts").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Payment methods --------
export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("payment_methods").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const PaymentMethodSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  type: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});
export const upsertPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PaymentMethodSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("payment_methods").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archivePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("payment_methods").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Expense categories --------
export const listExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("expense_categories").select("*").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ExpenseCatSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  is_active: z.boolean().default(true),
});
export const upsertExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExpenseCatSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("expense_categories").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("expense_categories").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Setup readiness --------
export const getSetupReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const bId = data.branchId;
    const today = new Date().toISOString().slice(0, 10);

    const [branch, groups, services, plans, methods, cats] = await Promise.all([
      supabase.from("branches").select("id").eq("id", bId).maybeSingle(),
      supabase.from("groups").select("id", { count: "exact", head: true }).eq("branch_id", bId).eq("is_active", true),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("branch_id", bId).eq("is_active", true),
      supabase.from("subscription_plans").select("id").eq("is_active", true).or(`branch_id.eq.${bId},branch_id.is.null`),
      supabase.from("payment_methods").select("id", { count: "exact", head: true }).eq("is_active", true).or(`branch_id.eq.${bId},branch_id.is.null`),
      supabase.from("expense_categories").select("id", { count: "exact", head: true }).eq("is_active", true).or(`branch_id.eq.${bId},branch_id.is.null`),
    ]);

    let planWithValidPrice = false;
    if ((plans.data ?? []).length > 0) {
      const planIds = (plans.data ?? []).map((p: any) => p.id);
      const { data: prices } = await supabase
        .from("price_versions").select("plan_id, valid_from, valid_to, is_active")
        .in("plan_id", planIds).eq("is_active", true);
      planWithValidPrice = (prices ?? []).some(
        (p: any) => p.valid_from <= today && (!p.valid_to || p.valid_to >= today),
      );
    }

    return {
      branch: !!branch.data,
      groups: (groups.count ?? 0) > 0,
      services: (services.count ?? 0) > 0,
      plansWithPrice: planWithValidPrice,
      paymentMethods: (methods.count ?? 0) > 0,
      expenseCategories: (cats.count ?? 0) > 0,
    };
  });
