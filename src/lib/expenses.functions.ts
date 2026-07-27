import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      branch_id: z.string().uuid().nullable().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("expenses")
      .select("id, spent_at, amount, description, branch_id, category_id, expense_categories:category_id(name)")
      .order("spent_at", { ascending: false })
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.from) q = q.gte("spent_at", data.from);
    if (data.to) q = q.lte("spent_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  spent_at: z.string(),
  description: z.string().nullable().optional(),
});

export const upsertExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = { ...data, created_by: context.userId };
    const { error } = await context.supabase.from("expenses").upsert(payload as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
