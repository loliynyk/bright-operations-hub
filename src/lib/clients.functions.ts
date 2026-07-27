import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("id, parent_first_name, parent_last_name, phone, email, status, branch_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [client, children, contracts, timeline, attachments, charges] = await Promise.all([
      supabase.from("clients").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("children").select("*, group:group_id(id, name, is_active)").eq("client_id", data.id).order("created_at"),
      supabase.from("contracts").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("timeline_events").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("client_attachments").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("charges").select("id, contract_id").eq("client_id", data.id),
    ]);
    if (client.error) throw new Error(client.error.message);
    if (!client.data) throw new Error("Клієнта не знайдено");
    const chargeCountByContract: Record<string, number> = {};
    for (const c of charges.data ?? []) {
      const cid = c.contract_id as string | null;
      if (!cid) continue;
      chargeCountByContract[cid] = (chargeCountByContract[cid] ?? 0) + 1;
    }
    return {
      client: client.data,
      children: children.data ?? [],
      contracts: contracts.data ?? [],
      timeline: timeline.data ?? [],
      attachments: attachments.data ?? [],
      chargeCountByContract,
    };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  parent_first_name: z.string().optional(),
  parent_last_name: z.string().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
  service_id: z.string().uuid().nullable().optional(),
});

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...patch } = data;
    const { data: updated, error } = await context.supabase.from("clients").update(patch as any).eq("id", id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return updated;
  });

const childSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  status: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export const saveChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => childSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...payload } = data;
    if (id) {
      const { data: updated, error } = await context.supabase.from("children").update(payload as any).eq("id", id).select().maybeSingle();
      if (error) throw new Error(error.message);
      return updated;
    }
    const { data: created, error } = await context.supabase.from("children").insert(payload as any).select().maybeSingle();
    if (error) throw new Error(error.message);
    return created;
  });
