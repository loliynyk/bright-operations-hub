import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const nullableString = z.string().nullable().optional();
const nullableDate = z.string().nullable().optional();

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  employee_number: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  full_name: z.string().min(1),
  position: nullableString,
  employment_type: z.enum(["full_time","part_time","contract","intern","other"]).nullable().optional(),
  hire_date: nullableDate,
  termination_date: nullableDate,
  status: z.enum(["active","paused","archived"]).optional(),
  phone: nullableString,
  email: nullableString,
  address: nullableString,
  birth_date: nullableDate,
  emergency_contact_name: nullableString,
  emergency_contact_phone: nullableString,
  emergency_contact_relationship: nullableString,
  bank_name: nullableString,
  card_number: nullableString,
  notes: nullableString,
  is_active: z.boolean().optional(),
});

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        branch_id: z.string().uuid().nullable().optional(),
        include_archived: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = (context.supabase as any)
      .from("employees")
      .select(
        "id, employee_number, full_name, first_name, last_name, position, employment_type, email, phone, branch_id, group_id, status, is_active, hire_date, bank_name, created_at",
      )
      .order("full_name")
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (!data.include_archived) q = q.neq("status", "archived");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getEmployee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    const { data: emp, error } = await sb
      .from("employees")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp) throw new Error("Не знайдено");

    const [{ data: salaries }, { data: payrolls }] = await Promise.all([
      sb
        .from("employee_salaries")
        .select("*")
        .eq("employee_id", data.id)
        .order("effective_from", { ascending: false }),
      sb
        .from("employee_payrolls")
        .select("*")
        .eq("employee_id", data.id)
        .order("period_month", { ascending: false }),
    ]);

    let currentSalary: any = null;
    const today = new Date().toISOString().slice(0, 10);
    for (const s of salaries ?? []) {
      if (s.effective_from <= today && (!s.effective_to || s.effective_to >= today)) {
        currentSalary = s;
        break;
      }
    }

    // fetch payments for all payrolls
    let payments: any[] = [];
    const ids = (payrolls ?? []).map((p: any) => p.id);
    if (ids.length) {
      const { data: pays } = await sb
        .from("payroll_payments")
        .select("*, payroll_payment_sources(name)")
        .in("payroll_id", ids)
        .order("paid_at", { ascending: false });
      payments = pays ?? [];
    }

    // Mask card number
    if (emp.card_number) {
      emp.card_number_masked = maskCard(emp.card_number);
    }
    delete emp.card_number; // never expose raw by default
    return { employee: emp, salaries: salaries ?? [], currentSalary, payrolls: payrolls ?? [], payments };
  });

function maskCard(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return "•••• " + digits;
  return "•••• •••• •••• " + digits.slice(-4);
}

export const revealEmployeeCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    // Only admin/manager can reveal
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isManager } = await sb.rpc("has_role", { _user_id: context.userId, _role: "manager" });
    if (!isAdmin && !isManager) throw new Error("Немає доступу");
    const { data: row, error } = await sb
      .from("employees")
      .select("card_number")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { card_number: (row?.card_number as string) ?? null };
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload: any = { ...data };
    if (!payload.full_name && (payload.first_name || payload.last_name)) {
      payload.full_name = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim();
    }
    if (payload.status === "archived") {
      payload.archived_at = new Date().toISOString();
      payload.is_active = false;
    } else if (payload.status === "active") {
      payload.archived_at = null;
      payload.is_active = true;
    }
    const { data: row, error } = await (context.supabase as any)
      .from("employees")
      .upsert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const archiveEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; archive: boolean }) => d)
  .handler(async ({ context, data }) => {
    const sb = context.supabase as any;
    if (data.archive) {
      // Check payroll history — do not delete, only archive.
      const { error } = await sb
        .from("employees")
        .update({ status: "archived", is_active: false, archived_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("employees")
        .update({ status: "active", is_active: true, archived_at: null })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const addEmployeeSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employee_id: z.string().uuid(),
        base_salary: z.number().nonnegative(),
        currency: z.string().default("UAH"),
        effective_from: z.string(),
        notes: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).rpc("add_employee_salary", {
      _employee_id: data.employee_id,
      _base_salary: data.base_salary,
      _currency: data.currency,
      _effective_from: data.effective_from,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
