import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addMonthsISO,
  computeEffectiveMonthly,
  computeMonthlyChargeAmount,
  endOfNextQuarterISO,
  firstOfMonthISO,
  monthsBetween,
} from "@/lib/finance-math";

async function insertTimeline(
  supabase: any,
  actorId: string,
  ev: { lead_id?: string; client_id?: string; contract_id?: string; type: string; payload?: any },
) {
  await supabase.from("timeline_events").insert({
    lead_id: ev.lead_id ?? null,
    client_id: ev.client_id ?? null,
    contract_id: ev.contract_id ?? null,
    type: ev.type,
    payload: ev.payload ?? {},
    actor_id: actorId,
  });
}

// ============================================================
// Lead -> Client + Child + Draft Contract (RPC, atomic).
// ============================================================
export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rpcRows, error } = await context.supabase.rpc("convert_lead_to_client", { _lead_id: data.leadId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!row?.client_id) throw new Error("Не вдалося створити клієнта");
    return {
      clientId: row.client_id as string,
      childId: (row.child_id ?? null) as string | null,
      contractId: (row.contract_id ?? null) as string | null,
    };
  });

// ============================================================
// Update contract fields; recalc future charges if confirmed.
// ============================================================
const updateContractSchema = z.object({
  id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
  price_version_id: z.string().uuid().nullable().optional(),
  discount_id: z.string().uuid().nullable().optional(),
  manual_discount: z.number().optional(),
  monthly_price: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  status: z.string().optional(),
  comment: z.string().nullable().optional(),
});

export const updateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateContractSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    if (patch.price_version_id && patch.monthly_price === undefined) {
      const { data: pv } = await context.supabase
        .from("price_versions").select("monthly_price").eq("id", patch.price_version_id).maybeSingle();
      if (pv) (patch as any).monthly_price = Number(pv.monthly_price);
    }
    const { data: updated, error } = await context.supabase
      .from("contracts").update(patch as any).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (updated && updated.status !== "draft" && !updated.recalc_locked) {
      try { await recalcContractChargesInner(context, updated.id); } catch { /* soft */ }
    }
    return updated;
  });

// ============================================================
// Confirm contract → initial recalc.
// ============================================================
const confirmSchema = z.object({
  id: z.string().uuid(),
  branch_id: z.string().uuid(),
  service_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  price_version_id: z.string().uuid(),
  discount_id: z.string().uuid().nullable().optional(),
  manual_discount: z.number().min(0).optional().default(0),
  monthly_price: z.number().positive(),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const confirmContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: pv, error: pvErr } = await supabase
      .from("price_versions")
      .select("id, plan_id, is_active, valid_from, valid_to, monthly_price")
      .eq("id", data.price_version_id).maybeSingle();
    if (pvErr) throw new Error(pvErr.message);
    if (!pv) throw new Error("Версію цін не знайдено");
    if (pv.plan_id !== data.plan_id) throw new Error("Версія цін не відповідає обраному тарифному плану");
    if (!pv.is_active) throw new Error("Версія цін не активна");
    const start = new Date(data.start_date);
    if (Number.isNaN(start.getTime())) throw new Error("Некоректна дата початку");
    if (pv.valid_from && start < new Date(pv.valid_from)) throw new Error("Версія цін ще не діє на дату початку");
    if (pv.valid_to && start > new Date(pv.valid_to)) throw new Error("Версія цін вже не діє на дату початку");

    const patch = {
      branch_id: data.branch_id,
      service_id: data.service_id,
      plan_id: data.plan_id,
      price_version_id: data.price_version_id,
      discount_id: data.discount_id ?? null,
      manual_discount: data.manual_discount ?? 0,
      monthly_price: data.monthly_price,
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      comment: data.comment ?? null,
      status: "confirmed" as const,
      confirmed_at: new Date().toISOString(),
    };
    const { data: contract, error: upErr } = await supabase
      .from("contracts").update(patch as any).eq("id", data.id).select().maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!contract) throw new Error("Договір не знайдено");

    await insertTimeline(supabase, userId, {
      client_id: contract.client_id, contract_id: contract.id,
      type: "status_changed", payload: { to: "confirmed" },
    });

    try { await recalcContractChargesInner(context, contract.id); } catch { /* soft */ }
    return { contract };
  });

// ============================================================
// recalcContractCharges — sole writer of contract charges.
// Never rewrites paid/partial/cancelled or historically-changed rows.
// ============================================================
export async function recalcContractChargesInner(context: any, contractId: string) {
  const { supabase, userId } = context;

  const { data: c } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!c) throw new Error("Договір не знайдено");
  if (c.status === "draft") throw new Error("Договір ще не підтверджено");
  if (!c.monthly_price || Number(c.monthly_price) <= 0) throw new Error("Не заповнено місячну ціну");
  if (c.recalc_locked) return { created: 0, updated: 0, cancelled: 0, drifts: 0 };

  let discount: { type: "percentage" | "fixed"; value: number } | null = null;
  if (c.discount_id) {
    const { data: d } = await supabase.from("discounts").select("type, value").eq("id", c.discount_id).maybeSingle();
    if (d) discount = { type: d.type, value: Number(d.value) };
  }
  const effective = computeEffectiveMonthly(Number(c.monthly_price), Number(c.manual_discount ?? 0), discount);

  // Rolling window: cover contract.start .. min(end, start + 12 months).
  const startIso = firstOfMonthISO(new Date(c.start_date));
  const horizon = addMonthsISO(startIso, 12);
  const endIso = c.end_date ? firstOfMonthISO(new Date(c.end_date)) : horizon;
  const upperIso = endIso < horizon ? endIso : horizon;
  const targetMonths = monthsBetween(startIso, upperIso);

  const { data: existing } = await supabase
    .from("charges")
    .select("id, period_month, amount, paid_amount, status, is_prorated, due_date")
    .eq("contract_id", contractId);
  const byMonth = new Map<string, any>();
  for (const r of existing ?? []) byMonth.set(r.period_month, r);

  let created = 0, updated = 0, cancelled = 0, drifts = 0;

  for (const period of targetMonths) {
    const { amount, prorated } = computeMonthlyChargeAmount({
      periodMonthISO: period,
      startDateISO: c.start_date,
      endDateISO: c.end_date ?? null,
      effectiveMonthly: effective,
    });
    const cur = byMonth.get(period);
    if (!cur) {
      const { error: iErr } = await supabase.from("charges").insert({
        branch_id: c.branch_id, client_id: c.client_id, contract_id: c.id,
        period_month: period, due_date: period, amount, is_prorated: prorated, status: "pending",
      });
      if (!iErr) created += 1;
    } else if (Number(cur.paid_amount ?? 0) === 0 && (cur.status === "pending" || cur.status === "overdue")) {
      if (Number(cur.amount) !== amount || cur.is_prorated !== prorated) {
        const { error: uErr } = await supabase
          .from("charges").update({ amount, is_prorated: prorated }).eq("id", cur.id);
        if (!uErr) updated += 1;
      }
    } else if (Number(cur.amount) !== amount) {
      drifts += 1;
      await insertTimeline(supabase, userId, {
        client_id: c.client_id, contract_id: c.id, type: "note_added",
        payload: { kind: "charge_drift", period_month: period, current: Number(cur.amount), expected: amount },
      });
    }
  }

  // Cancel untouched pending rows outside the target range (contract shortened).
  const targetSet = new Set(targetMonths);
  for (const r of existing ?? []) {
    if (!targetSet.has(r.period_month) && Number(r.paid_amount ?? 0) === 0 && r.status === "pending") {
      const { error: cErr } = await supabase.from("charges").update({ status: "cancelled" }).eq("id", r.id);
      if (!cErr) cancelled += 1;
    }
  }

  await insertTimeline(supabase, userId, {
    client_id: c.client_id, contract_id: c.id, type: "charges_generated",
    payload: { created, updated, cancelled, drifts },
  });

  return { created, updated, cancelled, drifts };
}

export const recalcContractCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => recalcContractChargesInner(context, data.contractId));

// Back-compat alias used by client card.
export const generateInitialCharges = recalcContractCharges;

// ============================================================
// PDF generation — never overwrites contract.status.
// ============================================================
async function generateContractPdfInner(context: any, contractId: string) {
  const { supabase, userId } = context;
  const { buildContractPdf } = await import("@/lib/pdf-contract.server");

  const { data: c } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!c) throw new Error("Договір не знайдено");
  if (c.status === "draft") throw new Error("Договір ще не підтверджено");

  const [{ data: branch }, { data: client }, { data: child }, { data: service }, { data: plan }, { data: disc }] = await Promise.all([
    supabase.from("branches").select("name").eq("id", c.branch_id).maybeSingle(),
    supabase.from("clients").select("*").eq("id", c.client_id).maybeSingle(),
    c.child_id ? supabase.from("children").select("*").eq("id", c.child_id).maybeSingle() : Promise.resolve({ data: null }),
    c.service_id ? supabase.from("services").select("name").eq("id", c.service_id).maybeSingle() : Promise.resolve({ data: null }),
    c.plan_id ? supabase.from("subscription_plans").select("name").eq("id", c.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    c.discount_id ? supabase.from("discounts").select("name, type, value").eq("id", c.discount_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const bytes = await buildContractPdf({
    number: c.number,
    branchName: branch?.name ?? "—",
    serviceName: service?.name ?? null,
    planName: plan?.name ?? null,
    monthlyPrice: Number(c.monthly_price ?? 0),
    discountLabel: disc ? `${disc.name} (${disc.type === "percentage" ? `${disc.value}%` : disc.value})` : (Number(c.manual_discount ?? 0) > 0 ? `Manual ${c.manual_discount}` : null),
    startDate: c.start_date,
    endDate: c.end_date,
    clientName: `${client?.parent_first_name ?? ""} ${client?.parent_last_name ?? ""}`.trim() || "—",
    clientPhone: client?.phone,
    clientEmail: client?.email,
    clientAddress: client?.address,
    childName: child ? `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() : null,
    childBirthDate: child?.birth_date ?? null,
  });

  const path = `${c.client_id}/${c.id}.pdf`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error: uploadErr } = await supabaseAdmin.storage.from("contracts").upload(path, bytes, {
    contentType: "application/pdf", upsert: true,
  });
  if (uploadErr) throw new Error(uploadErr.message);

  // Store path only — never touch status.
  await supabase.from("contracts").update({ pdf_path: path, pdf_url: null }).eq("id", c.id);

  const { data: existing } = await supabase.from("client_attachments").select("id").eq("contract_id", c.id).maybeSingle();
  if (!existing) {
    await supabase.from("client_attachments").insert({
      client_id: c.client_id, branch_id: c.branch_id, contract_id: c.id,
      name: `Договір ${c.number}.pdf`, url: path, mime: "application/pdf",
      size: bytes.byteLength, created_by: userId,
    });
  } else {
    await supabase.from("client_attachments").update({ url: path, size: bytes.byteLength }).eq("id", existing.id);
  }

  await insertTimeline(supabase, userId, {
    client_id: c.client_id, contract_id: c.id, type: "pdf_generated", payload: { path },
  });
  return { path };
}

export const generateContractPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    try {
      return await generateContractPdfInner(context, data.contractId);
    } catch (e: any) {
      await insertTimeline(context.supabase, context.userId, {
        contract_id: data.contractId, type: "note_added",
        payload: { error: "pdf_failed", message: e?.message ?? String(e) },
      });
      throw e;
    }
  });

export const getContractPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: c } = await context.supabase
      .from("contracts").select("pdf_path").eq("id", data.contractId).maybeSingle();
    const path = c?.pdf_path;
    if (!path) throw new Error("PDF ще не згенеровано");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from("contracts").createSignedUrl(path, 60 * 10);
    if (error) throw new Error(error.message);
    if (!signed?.signedUrl) throw new Error("Не вдалося отримати посилання");
    return { url: signed.signedUrl };
  });
