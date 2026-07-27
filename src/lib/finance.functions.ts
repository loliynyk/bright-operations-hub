import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Payments + allocations
// ============================================================
const recordPaymentSchema = z.object({
  client_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  amount: z.number().positive(),
  paid_at: z.string().min(1),
  payment_method_id: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
  external_ref: z.string().min(1).nullable().optional(),
  allocations: z.array(z.object({
    charge_id: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
});

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordPaymentSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: paymentId, error } = await supabase.rpc("post_payment", {
      _client_id: data.client_id,
      _branch_id: data.branch_id,
      _amount: data.amount,
      _paid_at: data.paid_at,
      _payment_method_id: (data.payment_method_id ?? null) as any,
      _note: (data.note ?? null) as any,
      _allocations: (data.allocations ?? null) as any,
      _external_ref: (data.external_ref ?? null) as any,
    });
    if (error) throw new Error(error.message);
    // Fetch summary for UI (credit + allocated count).
    const [{ data: pay }, { data: allocs }, { data: credit }] = await Promise.all([
      supabase.from("payments").select("*").eq("id", paymentId as string).maybeSingle(),
      supabase.from("payment_allocations").select("id").eq("payment_id", paymentId as string),
      supabase.from("client_credits").select("amount_remaining").eq("source_payment_id", paymentId as string).maybeSingle(),
    ]);
    return {
      payment: pay,
      allocated: (allocs ?? []).length,
      credited: credit ? Number(credit.amount_remaining) : 0,
    };
  });

export const voidPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("void_payment", { _payment_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manual reallocation via transactional RPC.
export const reallocatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    payment_id: z.string().uuid(),
    allocations: z.array(z.object({ charge_id: z.string().uuid(), amount: z.number().positive() })),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("reallocate_payment", {
      _payment_id: data.payment_id,
      _allocations: data.allocations as any,
    });
    if (error) throw new Error(error.message);
    const { data: credit } = await context.supabase
      .from("client_credits").select("amount_remaining")
      .eq("source_payment_id", data.payment_id).maybeSingle();
    return { ok: true, credited: credit ? Number(credit.amount_remaining) : 0 };
  });

export const adjustCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chargeId: string; newAmount: number; reason: string }) =>
    z.object({ chargeId: z.string().uuid(), newAmount: z.number().min(0), reason: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("adjust_charge", {
      _charge_id: data.chargeId, _new_amount: data.newAmount, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("charges").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Client-scoped finance summary (Fінанси tab)
// ============================================================
export const getClientFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: client } = await supabase.from("clients").select("branch_id").eq("id", data.clientId).maybeSingle();
    const branchId = client?.branch_id as string | undefined;
    const methodsQuery = branchId
      ? supabase.from("payment_methods").select("id, name, branch_id").eq("is_active", true).or(`branch_id.eq.${branchId},branch_id.is.null`)
      : supabase.from("payment_methods").select("id, name, branch_id").eq("is_active", true).is("branch_id", null);
    const [charges, payments, credits, allocations, methods] = await Promise.all([
      supabase.from("charges").select("*").eq("client_id", data.clientId).order("period_month"),
      supabase.from("payments").select("*").eq("client_id", data.clientId).order("paid_at", { ascending: false }),
      supabase.from("client_credits").select("*").eq("client_id", data.clientId).gt("amount_remaining", 0),
      supabase.from("payment_allocations").select("id, payment_id, charge_id, amount"),
      methodsQuery,
    ]);
    const chargeIds = new Set((charges.data ?? []).map((c: any) => c.id));
    const paymentIds = new Set((payments.data ?? []).map((p: any) => p.id));
    const relevantAllocs = (allocations.data ?? []).filter((a: any) => chargeIds.has(a.charge_id) || paymentIds.has(a.payment_id));
    return {
      charges: charges.data ?? [],
      payments: payments.data ?? [],
      credits: credits.data ?? [],
      allocations: relevantAllocs,
      methods: methods.data ?? [],
    };
  });

// ============================================================
// Nарахування — list with filters
// ============================================================
const chargesListSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
});
export const listCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => chargesListSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("charges")
      .select("id, period_month, amount, paid_amount, status, due_date, is_prorated, branch_id, client_id, contract_id, clients:client_id(parent_first_name, parent_last_name), contracts:contract_id(child_id, children:child_id(first_name, last_name, group_id))")
      .order("period_month", { ascending: false })
      .limit(500);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.from) q = q.gte("period_month", data.from);
    if (data.to) q = q.lte("period_month", data.to);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = data.group_id
      ? (rows ?? []).filter((r: any) => r.contracts?.children?.group_id === data.group_id)
      : rows ?? [];
    return filtered;
  });

// ============================================================
// Payments — list with filters
// ============================================================
const paymentsListSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  method_id: z.string().uuid().nullable().optional(),
  search: z.string().optional(),
});
export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => paymentsListSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("payments")
      .select("id, paid_at, amount, status, note, branch_id, client_id, payment_method_id, clients:client_id(parent_first_name, parent_last_name), payment_methods:payment_method_id(name), allocations:payment_allocations(id, charge_id, amount, charges:charge_id(period_month))")
      .order("paid_at", { ascending: false })
      .limit(500);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.from) q = q.gte("paid_at", data.from);
    if (data.to) q = q.lte("paid_at", data.to);
    if (data.method_id) q = q.eq("payment_method_id", data.method_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = rows ?? [];
    if (data.search) {
      const s = data.search.toLowerCase();
      out = out.filter((r: any) => {
        const name = `${r.clients?.parent_first_name ?? ""} ${r.clients?.parent_last_name ?? ""}`.toLowerCase();
        return name.includes(s);
      });
    }
    return out;
  });

// ============================================================
// Receivables — aging buckets per client
// ============================================================
export const listReceivables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid().nullable().optional(), group_id: z.string().uuid().nullable().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("charges")
      .select("id, period_month, amount, paid_amount, status, due_date, branch_id, client_id, contract_id, clients:client_id(parent_first_name, parent_last_name), contracts:contract_id(child_id, children:child_id(first_name, last_name, group_id, groups:group_id(name)))")
      .in("status", ["pending","partial","overdue"] as any);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const byClient = new Map<string, any>();
    for (const r of rows ?? []) {
      if (data.group_id && r.contracts?.children?.group_id !== data.group_id) continue;
      const remaining = Math.max(0, Number(r.amount) - Number(r.paid_amount ?? 0));
      if (remaining <= 0) continue;
      const due = new Date(r.due_date);
      const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
      const bucket = days <= 0 ? "current" : days <= 30 ? "b1_30" : days <= 60 ? "b31_60" : "b61_plus";
      let e = byClient.get(r.client_id);
      if (!e) {
        e = {
          client_id: r.client_id,
          client_name: `${r.clients?.parent_first_name ?? ""} ${r.clients?.parent_last_name ?? ""}`.trim(),
          child_name: r.contracts?.children ? `${r.contracts.children.first_name ?? ""} ${r.contracts.children.last_name ?? ""}`.trim() : "",
          group_name: r.contracts?.children?.groups?.name ?? "",
          total: 0, current: 0, b1_30: 0, b31_60: 0, b61_plus: 0,
          oldest_due: r.due_date, months_overdue: 0,
        };
        byClient.set(r.client_id, e);
      }
      e.total += remaining;
      (e as any)[bucket] += remaining;
      if (r.due_date < e.oldest_due) e.oldest_due = r.due_date;
      if (days > 0) e.months_overdue = Math.max(e.months_overdue, Math.ceil(days / 30));
    }
    return Array.from(byClient.values()).sort((a, b) => b.total - a.total);
  });

// ============================================================
// Cash Flow — payments in / expenses out by day
// ============================================================
const cashSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  from: z.string(),
  to: z.string(),
  method_id: z.string().uuid().nullable().optional(),
});
export const getCashFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cashSchema.parse(d))
  .handler(async ({ context, data }) => {
    let pq = context.supabase.from("payments").select("paid_at, amount, payment_method_id, branch_id, payment_methods:payment_method_id(name)").eq("status", "posted");
    let eq = context.supabase.from("expenses").select("spent_at, amount, category_id, branch_id, expense_categories:category_id(name)");
    if (data.branch_id) { pq = pq.eq("branch_id", data.branch_id); eq = eq.eq("branch_id", data.branch_id); }
    if (data.method_id) pq = pq.eq("payment_method_id", data.method_id);

    // Opening balance = cumulative before `from`.
    const [openP, openE] = await Promise.all([
      pq.lt("paid_at", data.from),
      eq.lt("spent_at", data.from),
    ]);
    const opening =
      (openP.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0) -
      (openE.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

    const [periodP, periodE] = await Promise.all([
      pq.gte("paid_at", data.from).lte("paid_at", data.to + "T23:59:59Z"),
      eq.gte("spent_at", data.from).lte("spent_at", data.to),
    ]);

    const byDay = new Map<string, { day: string; in: number; out: number }>();
    const byMethod = new Map<string, number>();
    const byCategory = new Map<string, number>();
    let inflow = 0, outflow = 0;
    for (const r of periodP.data ?? []) {
      const day = String(r.paid_at).slice(0, 10);
      const e = byDay.get(day) ?? { day, in: 0, out: 0 };
      e.in += Number(r.amount); byDay.set(day, e);
      inflow += Number(r.amount);
      const m = r.payment_methods?.name ?? "—";
      byMethod.set(m, (byMethod.get(m) ?? 0) + Number(r.amount));
    }
    for (const r of periodE.data ?? []) {
      const day = String(r.spent_at).slice(0, 10);
      const e = byDay.get(day) ?? { day, in: 0, out: 0 };
      e.out += Number(r.amount); byDay.set(day, e);
      outflow += Number(r.amount);
      const c = r.expense_categories?.name ?? "—";
      byCategory.set(c, (byCategory.get(c) ?? 0) + Number(r.amount));
    }
    return {
      opening, inflow, outflow, closing: opening + inflow - outflow,
      days: Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day)),
      by_method: Array.from(byMethod.entries()).map(([name, amount]) => ({ name, amount })),
      by_category: Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount })),
    };
  });

// ============================================================
// P&L — cash-basis revenue (payments) minus expenses
// ============================================================
export const getPnl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cashSchema.omit({ method_id: true }).parse(d))
  .handler(async ({ context, data }) => {
    let pq = context.supabase
      .from("payments")
      .select("paid_at, amount, client_id, branch_id, allocations:payment_allocations(charge_id, amount, charges:charge_id(contract_id, contracts:contract_id(service_id, income_category_id, services:service_id(name, income_category_id), income_categories:income_category_id(name))))")
      .eq("status", "posted");
    let eq = context.supabase.from("expenses").select("spent_at, amount, category_id, branch_id, expense_categories:category_id(name)");
    if (data.branch_id) { pq = pq.eq("branch_id", data.branch_id); eq = eq.eq("branch_id", data.branch_id); }

    const [pays, exps] = await Promise.all([
      pq.gte("paid_at", data.from).lte("paid_at", data.to + "T23:59:59Z"),
      eq.gte("spent_at", data.from).lte("spent_at", data.to),
    ]);

    const revenueByCategory = new Map<string, number>();
    const monthlyRevenue = new Map<string, number>();
    let revenueTotal = 0;
    for (const p of pays.data ?? []) {
      const month = String(p.paid_at).slice(0, 7);
      monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + Number(p.amount));
      revenueTotal += Number(p.amount);
      const allocSum = (p.allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount), 0) || 1;
      if ((p.allocations ?? []).length === 0) {
        revenueByCategory.set("Без розподілу", (revenueByCategory.get("Без розподілу") ?? 0) + Number(p.amount));
        continue;
      }
      for (const a of p.allocations) {
        const name =
          a.charges?.contracts?.income_categories?.name ??
          a.charges?.contracts?.services?.name ??
          "Без категорії";
        const share = Number(p.amount) * (Number(a.amount) / allocSum);
        revenueByCategory.set(name, (revenueByCategory.get(name) ?? 0) + share);
      }
    }
    const expenseByCategory = new Map<string, number>();
    const monthlyExpense = new Map<string, number>();
    let expenseTotal = 0;
    for (const e of exps.data ?? []) {
      const month = String(e.spent_at).slice(0, 7);
      monthlyExpense.set(month, (monthlyExpense.get(month) ?? 0) + Number(e.amount));
      expenseTotal += Number(e.amount);
      const name = e.expense_categories?.name ?? "Без категорії";
      expenseByCategory.set(name, (expenseByCategory.get(name) ?? 0) + Number(e.amount));
    }

    const months = new Set<string>([...monthlyRevenue.keys(), ...monthlyExpense.keys()]);
    const monthly = Array.from(months).sort().map((m) => ({
      month: m,
      revenue: Math.round((monthlyRevenue.get(m) ?? 0) * 100) / 100,
      expense: Math.round((monthlyExpense.get(m) ?? 0) * 100) / 100,
      result: Math.round(((monthlyRevenue.get(m) ?? 0) - (monthlyExpense.get(m) ?? 0)) * 100) / 100,
    }));

    return {
      revenue_total: Math.round(revenueTotal * 100) / 100,
      expense_total: Math.round(expenseTotal * 100) / 100,
      operating_result: Math.round((revenueTotal - expenseTotal) * 100) / 100,
      revenue_by_category: Array.from(revenueByCategory.entries()).map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })),
      expense_by_category: Array.from(expenseByCategory.entries()).map(([name, amount]) => ({ name, amount })),
      monthly,
    };
  });

// ============================================================
// Діти — groups + children with contract + debt
// ============================================================
export const listChildrenByGroup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid().nullable().optional(), show_archived: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    let gq = supabase.from("groups").select("id, name, age_range, age_from, age_to, capacity, branch_id, is_active").order("name");
    let cq = supabase.from("children").select("id, first_name, last_name, birth_date, start_date, end_date, status, group_id, branch_id, client_id, clients:client_id(parent_first_name, parent_last_name, phone)");
    if (data.branch_id) { gq = gq.eq("branch_id", data.branch_id); cq = cq.eq("branch_id", data.branch_id); }
    if (!data.show_archived) cq = cq.neq("status", "archived");
    const [groups, children, contracts, charges, plans, services] = await Promise.all([
      gq, cq,
      supabase.from("contracts").select("id, child_id, status, monthly_price, start_date, end_date, plan_id, service_id, updated_at").in("status", ["confirmed", "generated", "sent", "signed", "draft"]),
      supabase.from("charges").select("client_id, amount, paid_amount, status").in("status", ["pending","partial","overdue"] as any),
      supabase.from("subscription_plans").select("id, name"),
      supabase.from("services").select("id, name"),
    ]);

    const planName = new Map((plans.data ?? []).map((p: any) => [p.id, p.name]));
    const serviceName = new Map((services.data ?? []).map((s: any) => [s.id, s.name]));

    const debtByClient = new Map<string, number>();
    for (const ch of charges.data ?? []) {
      const d = Math.max(0, Number(ch.amount) - Number(ch.paid_amount ?? 0));
      debtByClient.set(ch.client_id, (debtByClient.get(ch.client_id) ?? 0) + d);
    }
    // Pick the most recent non-draft contract per child; fall back to draft.
    const contractByChild = new Map<string, any>();
    for (const c of contracts.data ?? []) {
      if (!c.child_id) continue;
      const prev = contractByChild.get(c.child_id);
      if (!prev) { contractByChild.set(c.child_id, c); continue; }
      const preferNew = (prev.status === "draft" && c.status !== "draft")
        || (prev.status === c.status && String(c.updated_at) > String(prev.updated_at));
      if (preferNew) contractByChild.set(c.child_id, c);
    }

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const in30iso = in30.toISOString().slice(0, 10);

    const enriched = (children.data ?? []).map((ch: any) => {
      const contract = contractByChild.get(ch.id);
      const debt = debtByClient.get(ch.client_id) ?? 0;
      const start = contract?.start_date ?? ch.start_date ?? null;
      const end = contract?.end_date ?? ch.end_date ?? null;

      let state: "active" | "upcoming" | "leaving" | "ended" | "no_contract" = "no_contract";
      if (contract) {
        if (start && start > today) state = "upcoming";
        else if (end && end < today) state = "ended";
        else if (end && end >= today && end <= in30iso) state = "leaving";
        else state = "active";
      }

      return {
        ...ch,
        parent_name: `${ch.clients?.parent_first_name ?? ""} ${ch.clients?.parent_last_name ?? ""}`.trim(),
        parent_phone: ch.clients?.phone ?? null,
        contract_status: contract?.status ?? null,
        monthly_price: contract ? Number(contract.monthly_price) : null,
        start_date: start,
        end_date: end,
        plan_name: contract?.plan_id ? planName.get(contract.plan_id) ?? null : null,
        service_name: contract?.service_id ? serviceName.get(contract.service_id) ?? null : null,
        debt: Math.round(debt * 100) / 100,
        state,
      };
    });

    const byGroup = new Map<string, any>();
    for (const g of groups.data ?? []) {
      if (!g.is_active) continue;
      byGroup.set(g.id, { group: g, children: [], active_count: 0, upcoming: 0, leaving: 0 });
    }
    const noGroup: any[] = [];
    for (const ch of enriched) {
      const bucket = ch.group_id ? byGroup.get(ch.group_id as string) : null;
      if (!bucket) { noGroup.push(ch); continue; }
      bucket.children.push(ch);
      if (ch.state === "active" || ch.state === "leaving") bucket.active_count += 1;
      if (ch.state === "upcoming") bucket.upcoming += 1;
      if (ch.state === "leaving") bucket.leaving += 1;
    }
    return { groups: Array.from(byGroup.values()), no_group: noGroup };
  });


// ============================================================
// Settlements — client-level aggregation for unified workspace
// ============================================================
const settlementsSchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  from: z.string(),
  to: z.string(),
  group_id: z.string().uuid().nullable().optional(),
});
export const getSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settlementsSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    // Charges: all non-cancelled for branch (need lifetime debt + period slice)
    let chQ = supabase
      .from("charges")
      .select("id, client_id, contract_id, period_month, amount, paid_amount, status, due_date, contracts:contract_id(child_id, children:child_id(id, first_name, last_name, group_id, groups:group_id(id, name)))")
      .neq("status", "cancelled");
    if (data.branch_id) chQ = chQ.eq("branch_id", data.branch_id);
    // Payments in the period
    let payQ = supabase
      .from("payments")
      .select("id, client_id, amount, paid_at, allocations:payment_allocations(charge_id, amount)")
      .eq("status", "posted")
      .gte("paid_at", data.from)
      .lte("paid_at", data.to + "T23:59:59Z");
    if (data.branch_id) payQ = payQ.eq("branch_id", data.branch_id);
    // Credits
    let crQ = supabase.from("client_credits").select("client_id, amount_remaining").gt("amount_remaining", 0);
    if (data.branch_id) crQ = crQ.eq("branch_id", data.branch_id);
    // Client names
    let clQ = supabase.from("clients").select("id, parent_first_name, parent_last_name, phone");
    if (data.branch_id) clQ = clQ.eq("branch_id", data.branch_id);

    const [charges, payments, credits, clients] = await Promise.all([chQ, payQ, crQ, clQ]);
    if (charges.error) throw new Error(charges.error.message);
    if (payments.error) throw new Error(payments.error.message);
    if (credits.error) throw new Error(credits.error.message);
    if (clients.error) throw new Error(clients.error.message);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const from = data.from;
    const to = data.to;

    type Row = {
      client_id: string;
      client_name: string;
      phone: string | null;
      children: { id: string; name: string; group_id: string | null; group_name: string | null }[];
      period_charged: number;
      period_paid: number;
      total_debt: number;
      overdue_debt: number;
      credit: number;
      oldest_unpaid_month: string | null;
      oldest_due_date: string | null;
      max_days_overdue: number;
    };
    const rows = new Map<string, Row>();
    const ensure = (cid: string): Row => {
      let r = rows.get(cid);
      if (!r) {
        const cl = (clients.data ?? []).find((c: any) => c.id === cid);
        r = {
          client_id: cid,
          client_name: cl ? `${cl.parent_first_name ?? ""} ${cl.parent_last_name ?? ""}`.trim() : "—",
          phone: cl?.phone ?? null,
          children: [],
          period_charged: 0, period_paid: 0, total_debt: 0, overdue_debt: 0, credit: 0,
          oldest_unpaid_month: null, oldest_due_date: null, max_days_overdue: 0,
        };
        rows.set(cid, r);
      }
      return r;
    };

    const seenChildKey = new Set<string>();
    for (const ch of charges.data ?? []) {
      const r = ensure(ch.client_id as string);
      const child: any = (ch as any).contracts?.children;
      if (child && !seenChildKey.has(`${ch.client_id}:${child.id}`)) {
        seenChildKey.add(`${ch.client_id}:${child.id}`);
        r.children.push({
          id: child.id,
          name: `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || "—",
          group_id: child.group_id ?? null,
          group_name: child.groups?.name ?? null,
        });
      }
      const amount = Number(ch.amount);
      const paid = Number(ch.paid_amount ?? 0);
      const remaining = Math.max(0, amount - paid);
      const pm = String(ch.period_month);
      if (pm >= from && pm <= to) r.period_charged += amount;
      if (remaining > 0.005) {
        r.total_debt += remaining;
        if (!r.oldest_unpaid_month || pm < r.oldest_unpaid_month) r.oldest_unpaid_month = pm;
        if (ch.due_date) {
          const due = new Date(ch.due_date);
          const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
          if (days > 0) {
            r.overdue_debt += remaining;
            if (days > r.max_days_overdue) r.max_days_overdue = days;
            if (!r.oldest_due_date || String(ch.due_date) < r.oldest_due_date) r.oldest_due_date = String(ch.due_date);
          }
        }
      }
    }
    for (const p of payments.data ?? []) {
      const r = ensure(p.client_id as string);
      r.period_paid += Number(p.amount);
    }
    for (const c of credits.data ?? []) {
      const r = ensure(c.client_id as string);
      r.credit += Number(c.amount_remaining);
    }

    let out = Array.from(rows.values());
    if (data.group_id) {
      out = out.filter((r) => r.children.some((c) => c.group_id === data.group_id));
    }
    // Round & sort
    for (const r of out) {
      r.period_charged = Math.round(r.period_charged * 100) / 100;
      r.period_paid = Math.round(r.period_paid * 100) / 100;
      r.total_debt = Math.round(r.total_debt * 100) / 100;
      r.overdue_debt = Math.round(r.overdue_debt * 100) / 100;
      r.credit = Math.round(r.credit * 100) / 100;
    }
    out.sort((a, b) => b.overdue_debt - a.overdue_debt || b.total_debt - a.total_debt || a.client_name.localeCompare(b.client_name));

    const totals = out.reduce((s, r) => {
      s.charged += r.period_charged;
      s.paid += r.period_paid;
      s.debt += r.total_debt;
      s.overdue += r.overdue_debt;
      s.credit += r.credit;
      return s;
    }, { charged: 0, paid: 0, debt: 0, overdue: 0, credit: 0 });
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = Math.round(totals[k] * 100) / 100;

    return { rows: out, totals };
  });
