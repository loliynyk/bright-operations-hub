import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branch_id?: string | null } | undefined) =>
    z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("leads")
      .select(
        "id, parent_name, parent_first_name, parent_last_name, parent_phone, parent_email, child_name, child_first_name, status, source, branch_id, service_id, registration_date, created_at, converted_client_id",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: lead, error } = await context.supabase
      .from("leads").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Лід не знайдено");
    const { data: events } = await context.supabase
      .from("timeline_events").select("*").eq("lead_id", data.id).order("created_at", { ascending: false });

    // Related lifecycle records — surfaced on the lead detail page so staff
    // can jump straight to the resulting client, children and contracts.
    let client: any = null;
    let children: any[] = [];
    let contracts: any[] = [];
    const clientId = (lead as any).converted_client_id as string | null;
    if (clientId) {
      const [cRes, kRes, ctRes] = await Promise.all([
        context.supabase.from("clients").select("id, parent_first_name, parent_last_name, phone, email, status, created_at").eq("id", clientId).maybeSingle(),
        context.supabase.from("children").select("id, first_name, last_name, birth_date, status").eq("client_id", clientId).order("created_at"),
        context.supabase.from("contracts").select("id, number, status, start_date, monthly_price").eq("client_id", clientId).order("created_at", { ascending: false }),
      ]);
      client = cRes.data ?? null;
      children = kRes.data ?? [];
      contracts = ctRes.data ?? [];
    }
    return { lead, events: events ?? [], related: { client, children, contracts } };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  source: z.string().nullable().optional(),
  source_form: z.string().nullable().optional(),
  registration_date: z.string().nullable().optional(),
  parent_first_name: z.string().nullable().optional(),
  parent_last_name: z.string().nullable().optional(),
  parent_name: z.string().optional(),
  parent_phone: z.string().nullable().optional(),
  parent_email: z.string().nullable().optional(),
  parent_address: z.string().nullable().optional(),
  child_first_name: z.string().nullable().optional(),
  child_last_name: z.string().nullable().optional(),
  child_name: z.string().nullable().optional(),
  child_birthdate: z.string().nullable().optional(),
  desired_start_date: z.string().nullable().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  trial_date: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const saveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...payload } = data;
    const pn = payload.parent_name
      ?? ([payload.parent_first_name, payload.parent_last_name].filter(Boolean).join(" ").trim() || "Без імені");
    const cn = payload.child_name
      ?? ([payload.child_first_name, payload.child_last_name].filter(Boolean).join(" ").trim() || null);
    const row: any = { ...payload, parent_name: pn, child_name: cn };

    if (id) {
      const prev = await context.supabase.from("leads").select("status").eq("id", id).maybeSingle();
      const { data: updated, error } = await context.supabase
        .from("leads").update(row).eq("id", id).select().maybeSingle();
      if (error) throw new Error(error.message);
      if (payload.status && prev.data?.status !== payload.status) {
        await context.supabase.from("timeline_events").insert({
          lead_id: id, type: "status_changed", actor_id: context.userId,
          payload: { from: prev.data?.status, to: payload.status },
        } as any);
      }
      return updated;
    } else {
      const { data: created, error } = await context.supabase
        .from("leads").insert({ ...row, created_by: context.userId }).select().maybeSingle();
      if (error) throw new Error(error.message);
      if (created) {
        await context.supabase.from("timeline_events").insert({
          lead_id: created.id, type: "lead_created", actor_id: context.userId, payload: {},
        } as any);
      }
      return created;
    }
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
