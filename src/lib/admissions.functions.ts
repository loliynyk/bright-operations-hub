import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// --- date helpers ---
function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function toIsoDate(d: Date) { return d.toISOString().slice(0, 10); }

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
// Lead → Client conversion (client + child + empty draft contract only).
// No plan/price selection, no charges, no PDF. Those happen on confirmation.
// ============================================================
export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rpcRows, error: rpcErr } = await supabase.rpc("convert_lead_to_client", { _lead_id: data.leadId });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!row?.client_id) throw new Error("Не вдалося створити клієнта");
    return {
      clientId: row.client_id as string,
      childId: (row.child_id ?? null) as string | null,
      contractId: (row.contract_id ?? null) as string | null,
    };
  });

// ============================================================
// Update draft contract fields (no side effects).
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
      if (pv) patch.monthly_price = Number(pv.monthly_price);
    }
    const { data: updated, error } = await context.supabase
      .from("contracts").update(patch as any).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return updated;
  });

// ============================================================
// Confirm contract: validate → update → charges (idempotent) → PDF → timeline.
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

    // Validate price version belongs to plan and is active
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

    return { contract };
  });

// ============================================================
// Idempotent first 3 charges (upsert on unique(contract_id, period_month)).
// ============================================================
async function generateInitialChargesInner(context: any, contractId: string) {
  const { supabase, userId } = context;
  const { data: contract, error } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!contract) throw new Error("Договір не знайдено");
  if (contract.status === "draft") throw new Error("Договір ще не підтверджено");
  if (!contract.monthly_price || Number(contract.monthly_price) <= 0) throw new Error("Не заповнено місячну ціну");

  let effective = Number(contract.monthly_price) - Number(contract.manual_discount ?? 0);
  if (contract.discount_id) {
    const { data: disc } = await supabase.from("discounts").select("type, value").eq("id", contract.discount_id).maybeSingle();
    if (disc) {
      if (disc.type === "percentage") effective = effective * (1 - Number(disc.value) / 100);
      else effective = effective - Number(disc.value);
    }
  }
  effective = Math.max(0, Math.round(effective * 100) / 100);

  const start = new Date(contract.start_date);
  const dim = daysInMonth(start);
  const startDay = start.getDate();
  const rows: any[] = [];
  for (let i = 0; i < 3; i++) {
    const periodDate = addMonths(firstOfMonth(start), i);
    let amount = effective;
    let prorated = false;
    if (i === 0 && startDay > 1) {
      const remainingDays = dim - startDay + 1;
      amount = Math.round((effective * remainingDays / dim) * 100) / 100;
      prorated = true;
    }
    rows.push({
      branch_id: contract.branch_id,
      client_id: contract.client_id,
      contract_id: contract.id,
      period_month: toIsoDate(periodDate),
      amount,
      is_prorated: prorated,
      status: "pending",
    });
  }

  const { error: upErr } = await supabase
    .from("charges")
    .upsert(rows, { onConflict: "contract_id,period_month", ignoreDuplicates: false });
  if (upErr) throw new Error(upErr.message);

  await insertTimeline(supabase, userId, {
    client_id: contract.client_id, contract_id: contract.id,
    type: "charges_generated", payload: { count: rows.length },
  });
  return { count: rows.length };
}

export const generateInitialCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    try {
      return await generateInitialChargesInner(context, data.contractId);
    } catch (e: any) {
      await insertTimeline(context.supabase, context.userId, {
        contract_id: data.contractId, type: "note_added",
        payload: { error: "charges_failed", message: e?.message ?? String(e) },
      });
      throw e;
    }
  });

// ============================================================
// PDF generation — permanent path stored in contracts.pdf_path.
// URL is fetched fresh via getContractPdfUrl.
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

  await supabase
    .from("contracts")
    .update({ pdf_path: path, pdf_url: null, status: "generated" })
    .eq("id", c.id);

  // Attachment record stores permanent path, not a signed URL.
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

// ============================================================
// Fresh signed URL on demand (does not persist).
// ============================================================
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
