import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().nullable().optional(),
      status: z.string().nullable().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("contracts")
      .select(
        "id, number, status, monthly_price, start_date, end_date, branch_id, client_id, child_id, plan_id, service_id, created_at, clients:client_id(parent_first_name, parent_last_name), children:child_id(first_name, last_name), subscription_plans:plan_id(name), services:service_id(name)",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status as any);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
