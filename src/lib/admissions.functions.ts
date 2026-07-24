import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

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

export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: rpcRows, error: rpcErr } = await supabase.rpc("convert_lead_to_client", { _lead_id: data.leadId });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!row?.client_id) throw new Error("Не вдалося створити клієнта");

    const clientId: string = row.client_id;
    const contractId: string | undefined = row.contract_id ?? undefined;

    // Best-effort side effects (charges + PDF) after atomic conversion
    if (contractId) {
      try { await generateInitialChargesInner(context, contractId); } catch (e) { console.error("charges error", e); }
      try { await generateContractPdfInner(context, contractId); } catch (e) { console.error("pdf error", e); }
    }

    return { clientId, contractId };
  });


async function generateInitialChargesInner(context: any, contractId: string) {
  const { supabase, userId } = context;
  const { data: contract } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!contract) return;

  // discount computation
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
  await supabase.from("charges").insert(rows);
  await insertTimeline(supabase, userId, {
    client_id: contract.client_id, contract_id: contract.id,
    type: "charges_generated", payload: { count: rows.length },
  });
}

export const generateInitialCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await generateInitialChargesInner(context, data.contractId);
    return { ok: true };
  });

async function generateContractPdfInner(context: any, contractId: string) {
  const { supabase, userId } = context;
  const { buildContractPdf } = await import("@/lib/pdf-contract.server");

  const { data: c } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!c) throw new Error("Договір не знайдено");
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
  const { error: upErr } = await supabaseAdmin.storage.from("contracts").upload(path, bytes, {
    contentType: "application/pdf", upsert: true,
  });
  if (upErr) throw new Error(upErr.message);
  const { data: signed } = await supabaseAdmin.storage.from("contracts").createSignedUrl(path, 60 * 60 * 24 * 30);
  const pdfUrl = signed?.signedUrl ?? path;

  await supabase.from("contracts").update({ pdf_url: pdfUrl, status: c.status === "draft" ? "generated" : c.status }).eq("id", c.id);

  // attachment record (avoid duplicates)
  const { data: existing } = await supabase.from("client_attachments").select("id").eq("contract_id", c.id).maybeSingle();
  if (!existing) {
    await supabase.from("client_attachments").insert({
      client_id: c.client_id, branch_id: c.branch_id, contract_id: c.id,
      name: `Договір ${c.number}.pdf`, url: pdfUrl, mime: "application/pdf",
      size: bytes.byteLength, created_by: userId,
    });
  } else {
    await supabase.from("client_attachments").update({ url: pdfUrl, size: bytes.byteLength }).eq("id", existing.id);
  }

  await insertTimeline(supabase, userId, { client_id: c.client_id, contract_id: c.id, type: "pdf_generated", payload: { url: pdfUrl } });

  return { url: pdfUrl };
}

export const generateContractPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    return await generateContractPdfInner(context, data.contractId);
  });

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
    // Auto-fill monthly_price from selected price_version if not provided
    if (patch.price_version_id && patch.monthly_price === undefined) {
      const { data: pv } = await context.supabase.from("price_versions").select("monthly_price").eq("id", patch.price_version_id).maybeSingle();
      if (pv) patch.monthly_price = Number(pv.monthly_price);
    }
    const { data: updated, error } = await context.supabase
      .from("contracts").update(patch as any).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return updated;
  });
