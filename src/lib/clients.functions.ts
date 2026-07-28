import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertValidBirthDate,
  assertValidChildName,
  sanitizeOptionalName,
} from "@/lib/child-validation";

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branch_id?: string | null } | undefined) =>
    z.object({ branch_id: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("clients")
      .select("id, parent_first_name, parent_last_name, phone, email, status, branch_id, lead_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: clients, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (clients ?? []).map((c: any) => c.id);
    if (ids.length === 0) return [];
    const { data: kids } = await context.supabase
      .from("children")
      .select("client_id, start_date, status")
      .in("client_id", ids);
    const startByClient = new Map<string, string>();
    const activeByClient = new Map<string, number>();
    const totalByClient = new Map<string, number>();
    for (const k of kids ?? []) {
      const cid = k.client_id as string;
      totalByClient.set(cid, (totalByClient.get(cid) ?? 0) + 1);
      if (k.status !== "archived") activeByClient.set(cid, (activeByClient.get(cid) ?? 0) + 1);
      if (!k.start_date) continue;
      const cur = startByClient.get(cid);
      const s = String(k.start_date);
      if (!cur || s < cur) startByClient.set(cid, s);
    }
    return (clients ?? []).map((c: any) => ({
      ...c,
      start_date: startByClient.get(c.id) ?? null,
      child_count: totalByClient.get(c.id) ?? 0,
      active_child_count: activeByClient.get(c.id) ?? 0,
    }));
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [client, children, contracts, timeline, attachments, charges, payments] = await Promise.all([
      supabase.from("clients").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("children").select("*, group:group_id(id, name, is_active)").eq("client_id", data.id).order("created_at"),
      supabase.from("contracts").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("timeline_events").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("client_attachments").select("*").eq("client_id", data.id).order("created_at", { ascending: false }),
      supabase.from("charges").select("id, contract_id, period_month, amount, status").eq("client_id", data.id).order("period_month"),
      supabase.from("payments").select("id, status").eq("client_id", data.id).limit(200),
    ]);
    if (client.error) throw new Error(client.error.message);
    if (!client.data) throw new Error("Клієнта не знайдено");
    const chargeCountByContract: Record<string, number> = {};
    const chargesByContract: Record<string, Array<{ id: string; period_month: string; amount: number; status: string }>> = {};
    for (const c of charges.data ?? []) {
      const cid = c.contract_id as string | null;
      if (!cid) continue;
      chargeCountByContract[cid] = (chargeCountByContract[cid] ?? 0) + 1;
      (chargesByContract[cid] ||= []).push({ id: c.id as string, period_month: c.period_month as string, amount: Number(c.amount), status: c.status as string });
    }
    const hasPayment = (payments.data ?? []).some((p: any) => p.status === "posted");
    return {
      client: client.data,
      children: children.data ?? [],
      contracts: contracts.data ?? [],
      timeline: timeline.data ?? [],
      attachments: attachments.data ?? [],
      chargeCountByContract,
      chargesByContract,
      hasPayment,
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
    const { supabase, userId } = context;
    const { id, ...payload } = data;

    // Validation: names, birth date.
    payload.first_name = assertValidChildName(payload.first_name, "Ім'я");
    if (payload.last_name !== undefined) {
      payload.last_name = sanitizeOptionalName(payload.last_name);
    }
    if (payload.birth_date !== undefined) {
      payload.birth_date = assertValidBirthDate(payload.birth_date);
    }

    // Server-side branch trust: on update, ignore any client-supplied
    // branch_id and use the persisted row's branch_id. On insert, derive
    // it from the parent client. This prevents cross-branch escapes via
    // a manipulated payload (RLS still applies to the read/write below).
    let effectiveBranchId: string;
    if (id) {
      const { data: row, error: re } = await supabase
        .from("children").select("branch_id").eq("id", id).maybeSingle();
      if (re) throw new Error(re.message);
      if (!row) throw new Error("Дитину не знайдено");
      effectiveBranchId = row.branch_id as string;
    } else {
      const { data: parent, error: pe } = await supabase
        .from("clients").select("branch_id").eq("id", payload.client_id).maybeSingle();
      if (pe) throw new Error(pe.message);
      if (!parent) throw new Error("Клієнта не знайдено");
      effectiveBranchId = parent.branch_id as string;
    }
    payload.branch_id = effectiveBranchId;

    // If a group is provided, verify it belongs to the SAME (server-derived)
    // branch and is active (unless it is the already-assigned historical
    // group on this child). Do NOT trust the branch coming from the client.
    if (payload.group_id) {
      const { data: g, error: ge } = await supabase
        .from("groups").select("id, branch_id, is_active").eq("id", payload.group_id).maybeSingle();
      if (ge) throw new Error(ge.message);
      if (!g) throw new Error("Групу не знайдено");
      if (g.branch_id !== effectiveBranchId) {
        throw new Error("Не можна призначити групу з іншої філії");
      }
      if (!g.is_active) {
        const keepingSame = id
          ? (await supabase.from("children").select("group_id").eq("id", id).maybeSingle()).data?.group_id === payload.group_id
          : false;
        if (!keepingSame) throw new Error("Група в архіві недоступна для нового призначення");
      }
    }

    if (id) {
      const { data: prev } = await supabase
        .from("children")
        .select("group_id, status, first_name, last_name, groups:group_id(name)")
        .eq("id", id).maybeSingle();
      const { data: updated, error } = await supabase.from("children").update(payload as any).eq("id", id).select("*, group:group_id(id, name, is_active)").maybeSingle();
      if (error) throw new Error(error.message);

      // Timeline: group change
      if (prev && payload.group_id !== undefined && payload.group_id !== prev.group_id) {
        const { data: newGroup } = payload.group_id
          ? await supabase.from("groups").select("name").eq("id", payload.group_id).maybeSingle()
          : { data: null } as any;
        await supabase.from("timeline_events").insert({
          client_id: payload.client_id,
          branch_id: payload.branch_id,
          type: "note_added",
          actor_id: userId,
          payload: {
            kind: "child_group_changed",
            child_id: id,
            child_name: `${payload.first_name} ${payload.last_name ?? ""}`.trim(),
            from_group_id: prev.group_id,
            from_group_name: (prev as any).groups?.name ?? null,
            to_group_id: payload.group_id,
            to_group_name: newGroup?.name ?? null,
          },
        } as any);
      }

      // Timeline: status change (archive/restore)
      if (prev && payload.status && payload.status !== prev.status) {
        await supabase.from("timeline_events").insert({
          client_id: payload.client_id,
          branch_id: payload.branch_id,
          type: "status_changed",
          actor_id: userId,
          payload: {
            kind: "child_status_changed",
            child_id: id,
            child_name: `${payload.first_name} ${payload.last_name ?? ""}`.trim(),
            from: prev.status,
            to: payload.status,
          },
        } as any);
      }
      return updated;
    }
    const { data: created, error } = await supabase.from("children").insert(payload as any).select("*, group:group_id(id, name, is_active)").maybeSingle();
    if (error) throw new Error(error.message);
    if (created) {
      await supabase.from("timeline_events").insert({
        client_id: payload.client_id,
        branch_id: payload.branch_id,
        type: "note_added",
        actor_id: userId,
        payload: {
          kind: "child_created",
          child_id: created.id,
          child_name: `${payload.first_name} ${payload.last_name ?? ""}`.trim(),
        },
      } as any);
    }
    return created;
  });

const archiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
});

export const archiveChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prev, error: pe } = await supabase
      .from("children").select("id, client_id, branch_id, status, first_name, last_name").eq("id", data.id).maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!prev) throw new Error("Дитину не знайдено");
    if (prev.status === "archived") return prev;
    const { error } = await supabase.from("children").update({ status: "archived" } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("timeline_events").insert({
      client_id: prev.client_id,
      branch_id: prev.branch_id,
      type: "status_changed",
      actor_id: userId,
      payload: {
        kind: "child_archived",
        child_id: data.id,
        child_name: `${prev.first_name} ${prev.last_name ?? ""}`.trim(),
        from: prev.status,
        to: "archived",
        reason: data.reason ?? null,
      },
    } as any);
    return { ok: true };
  });

export const restoreChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const isAdmin = context.claims?.role === "admin" || context.claims?.role === "manager";
    if (!isAdmin) {
      const { data: hasRole } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any });
      const { data: hasManager } = await supabase.rpc("has_role", { _user_id: userId, _role: "manager" as any });
      if (!hasRole && !hasManager) throw new Error("Лише адміністратор/менеджер може відновлювати");
    }
    const { data: prev, error: pe } = await supabase
      .from("children").select("id, client_id, branch_id, status, first_name, last_name").eq("id", data.id).maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!prev) throw new Error("Дитину не знайдено");
    const { error } = await supabase.from("children").update({ status: "active" } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("timeline_events").insert({
      client_id: prev.client_id,
      branch_id: prev.branch_id,
      type: "status_changed",
      actor_id: userId,
      payload: {
        kind: "child_restored",
        child_id: data.id,
        child_name: `${prev.first_name} ${prev.last_name ?? ""}`.trim(),
        from: prev.status,
        to: "active",
      },
    } as any);
    return { ok: true };
  });

// ============================================================
// Get one child with related client + active contract + charges.
// Used by the dedicated child card.
// ============================================================
export const getChild = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: child, error } = await supabase
      .from("children")
      .select("*, group:group_id(id, name, is_active, capacity), clients:client_id(id, parent_first_name, parent_last_name, phone, email, branch_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!child) throw new Error("Дитину не знайдено");
    const [{ data: contracts }, { data: charges }, { data: allEvents }] = await Promise.all([
      supabase
        .from("contracts")
        .select("id, number, status, monthly_price, start_date, end_date, plan_id, service_id, updated_at, service:service_id(id, name), plan:plan_id(id, name), price_version:price_version_id(id, name, monthly_price)")
        .eq("child_id", data.id)
        .order("updated_at", { ascending: false }),
      supabase.from("charges").select("id, contract_id, period_month, amount, paid_amount, status").eq("client_id", child.client_id).order("period_month", { ascending: false }),
      supabase.from("timeline_events").select("id, type, payload, actor_id, created_at, contract_id").eq("client_id", child.client_id).order("created_at", { ascending: false }).limit(200),
    ]);
    // Child-specific timeline: events whose payload references this child OR
    // events tied to a contract on this child.
    const contractIds = new Set((contracts ?? []).map((c: any) => c.id));
    const timeline = (allEvents ?? []).filter((e: any) => {
      const payloadChildId = e.payload?.child_id;
      if (payloadChildId === data.id) return true;
      if (e.contract_id && contractIds.has(e.contract_id)) return true;
      return false;
    });
    return { child, contracts: contracts ?? [], charges: charges ?? [], timeline };
  });

// ============================================================
// Complete child attendance — transactional via RPC.
// Structured reason codes: completed | moved | withdrew | other.
// ============================================================
const departureReasonCode = z.enum(["completed", "moved", "withdrew", "other"]);

export const completeChildAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      end_date: z.string().min(1),
      reason_code: departureReasonCode,
      note: z.string().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // We keep the legacy _reason free-text slot in sync with the note for
    // backward-compatible timeline reads.
    const { data: res, error } = await context.supabase.rpc("complete_child_attendance", {
      _child_id: data.id,
      _end_date: data.end_date,
      _reason: (data.note ?? null) as any,
      _reason_code: data.reason_code,
      _note: (data.note ?? null) as any,
    } as any);
    if (error) throw new Error(error.message);
    return res as {
      ok: boolean;
      charges_cancelled: number;
      contract_id: string | null;
      contract_closed: boolean;
      child_status: string;
      contract_status: string | null;
    };
  });

// ============================================================
// Reopen a graduated/archived departure. Admin/manager only.
// Restores active status, clears end_date, reopens the contract.
// Does NOT recreate cancelled Charges — surface tells the operator that
// billing must be reviewed/re-generated explicitly.
// ============================================================
export const reopenChildAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      note: z.string().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
      supabase.rpc("has_role", { _user_id: userId, _role: "manager" as any }),
    ]);
    if (!isAdmin && !isManager) {
      throw new Error("Лише адміністратор або менеджер може відновлювати відвідування");
    }
    const { data: res, error } = await supabase.rpc("reopen_child_attendance", {
      _child_id: data.id,
      _note: (data.note ?? null) as any,
    } as any);
    if (error) throw new Error(error.message);
    return res as {
      ok: boolean;
      child_status: string;
      contract_id: string | null;
      contract_status: string | null;
      billing_review_required: boolean;
    };
  });

