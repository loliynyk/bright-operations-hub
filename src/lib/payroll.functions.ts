import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function monthStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const listPayrolls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().nullable().optional(),
        period_month: z.string(),
        group_id: z.string().uuid().nullable().optional(),
        position: z.string().nullable().optional(),
        status: z.enum(["not_paid", "partial", "paid", "overpaid"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const period = monthStart(data.period_month);
    let q = sb
      .from("employee_payrolls")
      .select(
        "id, employee_id, branch_id, period_month, base_salary_snapshot, currency, bonus_amount, bonus_description, deduction_amount, deduction_description, amount_to_pay, amount_paid, amount_outstanding, status, notes, employees!inner(id, full_name, position, group_id, branch_id, status)",
      )
      .eq("period_month", period)
      .order("period_month", { ascending: false })
      .limit(2000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let list = (rows ?? []) as any[];
    if (data.group_id) list = list.filter((r) => r.employees?.group_id === data.group_id);
    if (data.position) list = list.filter((r) => (r.employees?.position ?? "") === data.position);
    return list;
  });

export const generateMonthlyPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().nullable().optional(), period_month: z.string() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: created, error } = await (context.supabase as any).rpc("generate_monthly_payroll", {
      _branch_id: data.branch_id ?? null,
      _period_month: monthStart(data.period_month),
    });
    if (error) throw new Error(error.message);
    return { created: (created as number) ?? 0 };
  });

export const updatePayrollAdjustments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        bonus_amount: z.number().nonnegative().optional(),
        bonus_description: z.string().nullable().optional(),
        deduction_amount: z.number().nonnegative().optional(),
        deduction_description: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { error } = await (context.supabase as any).from("employee_payrolls").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPayrollPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payroll_id: z.string().uuid(),
        employee_id: z.string().uuid(),
        paid_at: z.string(),
        amount: z.number().positive(),
        payment_type: z.enum(["advance", "salary", "cash_part", "bonus", "adjustment", "other"]),
        source_id: z.string().uuid().nullable().optional(),
        payment_method: z.enum(["bank_transfer", "card_transfer", "cash", "other"]),
        reference: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("payroll_payments").insert({
      ...data,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePayrollPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("payroll_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPaymentSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    let q = sb.from("payroll_payment_sources").select("id, name, branch_id, is_active").eq("is_active", true).order("name");
    if (data.branch_id) {
      q = q.or(`branch_id.is.null,branch_id.eq.${data.branch_id}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });
