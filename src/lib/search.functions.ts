import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SearchResult = {
  kind: "lead" | "client" | "child" | "group";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ context, data }): Promise<SearchResult[]> => {
    const q = data.q.trim();
    const like = `%${q}%`;
    const { supabase } = context;
    const [leads, clients, children, groups] = await Promise.all([
      supabase.from("leads")
        .select("id, parent_name, parent_phone, child_name")
        .or(`parent_name.ilike.${like},parent_phone.ilike.${like},child_name.ilike.${like},parent_email.ilike.${like}`)
        .limit(8),
      supabase.from("clients")
        .select("id, parent_first_name, parent_last_name, phone, email")
        .or(`parent_first_name.ilike.${like},parent_last_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(8),
      supabase.from("children")
        .select("id, client_id, first_name, last_name")
        .or(`first_name.ilike.${like},last_name.ilike.${like}`)
        .limit(8),
      supabase.from("groups")
        .select("id, name, age_range")
        .ilike("name", like)
        .limit(8),
    ]);
    const results: SearchResult[] = [];
    for (const l of leads.data ?? []) {
      results.push({ kind: "lead", id: l.id, title: l.parent_name ?? "—", subtitle: l.child_name ?? l.parent_phone ?? undefined, href: `/leads/${l.id}` });
    }
    for (const c of clients.data ?? []) {
      results.push({ kind: "client", id: c.id, title: `${c.parent_first_name} ${c.parent_last_name}`, subtitle: c.phone ?? c.email ?? undefined, href: `/clients/${c.id}` });
    }
    for (const ch of children.data ?? []) {
      results.push({ kind: "child", id: ch.id, title: `${ch.first_name} ${ch.last_name ?? ""}`.trim(), href: `/clients/${ch.client_id}` });
    }
    for (const g of groups.data ?? []) {
      results.push({ kind: "group", id: g.id, title: g.name, subtitle: g.age_range ?? undefined, href: `/admin/groups` });
    }
    return results;
  });
