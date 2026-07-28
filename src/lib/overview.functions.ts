import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Aggregated dashboard payload for Business Overview.
 * All queries are branch-scoped.
 */
export const getOverviewDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId: string }) =>
    z.object({ branchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const branchId = data.branchId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);
    const in14 = new Date(now.getTime() + 14 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const [
      clients,
      children,
      leadsAll,
      chargesMonth,
      chargesOutstanding,
      paymentsMonth,
      leadsRecent,
      clientsRecent,
      paymentsRecent,
      groups,
      contractsStarting,
      contractsEnding,
    ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, status")
        .eq("branch_id", branchId),
      supabase
        .from("children")
        .select("id, status, group_id, birth_date")
        .eq("branch_id", branchId),
      supabase
        .from("leads")
        .select("id, status, created_at, converted_client_id")
        .eq("branch_id", branchId),
      supabase
        .from("charges")
        .select("id, amount, paid_amount, status")
        .eq("branch_id", branchId)
        .gte("period_month", monthStart)
        .lt("period_month", nextMonthStart),
      supabase
        .from("charges")
        .select("id, amount, paid_amount, client_id, status")
        .eq("branch_id", branchId)
        .in("status", ["pending", "partial", "overdue"]),
      supabase
        .from("payments")
        .select("id, amount, paid_at, status, client_id")
        .eq("branch_id", branchId)
        .eq("status", "posted")
        .gte("paid_at", monthStart),
      supabase
        .from("leads")
        .select("id, parent_name, child_name, status, created_at")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("clients")
        .select("id, parent_first_name, parent_last_name, created_at")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("payments")
        .select("id, amount, paid_at, client_id, status")
        .eq("branch_id", branchId)
        .eq("status", "posted")
        .order("paid_at", { ascending: false })
        .limit(5),
      supabase
        .from("groups")
        .select("id, name, capacity, is_active")
        .eq("branch_id", branchId)
        .eq("is_active", true),
      supabase
        .from("contracts")
        .select("id, client_id, start_date, status")
        .eq("branch_id", branchId)
        .gte("start_date", today)
        .lte("start_date", in14)
        .in("status", ["confirmed", "signed", "generated"]),
      supabase
        .from("contracts")
        .select("id, client_id, end_date, status")
        .eq("branch_id", branchId)
        .gte("end_date", today)
        .lte("end_date", in30)
        .in("status", ["confirmed", "signed", "generated"]),
    ]);

    // Derived KPIs
    const activeClients = (clients.data ?? []).filter((c: any) => c.status === "active").length;
    const activeChildren = (children.data ?? []).filter((c: any) => c.status === "active").length;
    const leadsList = leadsAll.data ?? [];
    const openLeadStatuses = new Set([
      "new",
      "contacted",
      "waiting",
      "trial",
      "tour_scheduled",
      "tour_done",
      "negotiation",
      "contract",
    ]);
    const openLeads = leadsList.filter((l: any) => openLeadStatuses.has(l.status)).length;
    const newLeadsThisMonth = leadsList.filter(
      (l: any) => l.created_at && l.created_at.slice(0, 10) >= monthStart,
    ).length;
    const convertedThisMonth = leadsList.filter(
      (l: any) => l.converted_client_id && l.created_at && l.created_at.slice(0, 10) >= monthStart,
    ).length;
    const chargedMonth = (chargesMonth.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount ?? 0),
      0,
    );
    const paidMonth = (paymentsMonth.data ?? []).reduce(
      (s: number, r: any) => s + Number(r.amount ?? 0),
      0,
    );
    const outstanding = (chargesOutstanding.data ?? []).reduce(
      (s: number, r: any) => s + Math.max(0, Number(r.amount) - Number(r.paid_amount ?? 0)),
      0,
    );

    // Leads by stage
    const stages: Record<string, number> = {};
    for (const l of leadsList) {
      stages[l.status] = (stages[l.status] ?? 0) + 1;
    }

    // Group occupancy — enrolled = active children in that group
    const enrolledByGroup: Record<string, number> = {};
    for (const c of children.data ?? []) {
      if (c.status !== "active" || !c.group_id) continue;
      enrolledByGroup[c.group_id] = (enrolledByGroup[c.group_id] ?? 0) + 1;
    }
    const occupancy = (groups.data ?? [])
      .map((g: any) => ({
        id: g.id,
        name: g.name,
        capacity: g.capacity ?? null,
        enrolled: enrolledByGroup[g.id] ?? 0,
      }))
      .sort((a, b) => b.enrolled - a.enrolled)
      .slice(0, 8);

    // Top outstanding clients
    const byClient = new Map<string, number>();
    for (const c of chargesOutstanding.data ?? []) {
      const remain = Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0));
      byClient.set(c.client_id, (byClient.get(c.client_id) ?? 0) + remain);
    }
    const topOutstandingIds = [...byClient.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    let outstandingClients: Array<{ id: string; name: string; amount: number }> = [];
    if (topOutstandingIds.length) {
      const { data: rows } = await supabase
        .from("clients")
        .select("id, parent_first_name, parent_last_name")
        .in(
          "id",
          topOutstandingIds.map(([id]) => id),
        );
      outstandingClients = topOutstandingIds.map(([id, amount]) => {
        const c = (rows ?? []).find((r: any) => r.id === id);
        return {
          id,
          name: c ? `${c.parent_first_name} ${c.parent_last_name}` : "—",
          amount,
        };
      });
    }

    // Birthdays this month
    const birthdaysThisMonth = (children.data ?? [])
      .filter((c: any) => {
        if (!c.birth_date || c.status !== "active") return false;
        const d = new Date(c.birth_date);
        return d.getMonth() === now.getMonth();
      }).length;

    return {
      kpi: {
        activeClients,
        activeChildren,
        openLeads,
        chargedMonth,
        paidMonth,
        outstanding,
      },
      leadsByStage: stages,
      newLeadsThisMonth,
      convertedThisMonth,
      occupancy,
      contractsStarting: contractsStarting.data ?? [],
      contractsEnding: contractsEnding.data ?? [],
      outstandingClients,
      birthdaysThisMonth,
      recent: {
        leads: leadsRecent.data ?? [],
        clients: clientsRecent.data ?? [],
        payments: paymentsRecent.data ?? [],
      },
    };
  });

/**
 * Inline lead status update. Reuses timeline_events for audit.
 */
export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase
      .from("leads").select("status").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("Ліда не знайдено");
    if (prev.status === data.status) return { ok: true };
    const { error } = await supabase
      .from("leads").update({ status: data.status } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("timeline_events").insert({
      lead_id: data.id,
      type: "status_changed",
      actor_id: userId,
      payload: { from: prev.status, to: data.status, inline: true },
    } as any);
    return { ok: true };
  });

/**
 * Inline client status update.
 */
export const updateClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "archived"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients").update({ status: data.status } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
