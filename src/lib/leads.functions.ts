import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, parent_name, parent_first_name, parent_last_name, parent_phone, parent_email, child_name, child_first_name, status, source, branch_id, service_id, created_at, converted_client_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
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
    return { lead, events: events ?? [] };
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
      ?? [payload.parent_first_name, payload.parent_last_name].filter(Boolean).join(" ").trim()
      || "Без імені";
    const cn = payload.child_name
      ?? [payload.child_first_name, payload.child_last_name].filter(Boolean).join(" ").trim()
      || null;

    if (id) {
      const prev = await context.supabase.from("leads").select("status").eq("id", id).maybeSingle();
      const { data: updated, error } = await context.supabase
        .from("leads")
        .update({ ...payload, parent_name: pn, child_name: cn })
        .eq("id", id).select().maybeSingle();
      if (error) throw new Error(error.message);
      if (payload.status && prev.data?.status !== payload.status) {
        await context.supabase.from("timeline_events").insert({
          lead_id: id, type: "status_changed", actor_id: context.userId,
          payload: { from: prev.data?.status, to: payload.status },
        });
      }
      return updated;
    } else {
      const { data: created, error } = await context.supabase
        .from("leads")
        .insert({ ...payload, parent_name: pn, child_name: cn, created_by: context.userId })
        .select().maybeSingle();
      if (error) throw new Error(error.message);
      if (created) {
        await context.supabase.from("timeline_events").insert({
          lead_id: created.id, type: "lead_created", actor_id: context.userId, payload: {},
        });
      }
      return created;
    }
  });
