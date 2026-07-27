import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("employees")
      .select("id, full_name, position, email, phone, branch_id, is_active, created_at")
      .order("full_name")
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  full_name: z.string().min(1),
  position: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("employees").upsert(data as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("employees").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
