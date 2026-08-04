import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeFinalPrice } from "@/lib/lead-workflow";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function getRoles(context: any): Promise<string[]> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return (data ?? []).map((r: any) => r.role as string);
}

async function assertPrivileged(context: any) {
  const roles = await getRoles(context);
  if (!roles.includes("admin") && !roles.includes("manager")) {
    throw new Error("Недостатньо прав для цієї дії");
  }
  return roles;
}

async function assertAdmin(context: any) {
  const roles = await getRoles(context);
  if (!roles.includes("admin")) throw new Error("Дія доступна лише адміністратору");
  return roles;
}

async function logTimeline(context: any, leadId: string, type: string, payload: any) {
  await context.supabase.from("timeline_events").insert({
    lead_id: leadId,
    type,
    payload: payload ?? {},
    actor_id: context.userId,
  } as any);
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

export const getLeadWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const roles = await getRoles(context);
    const privileged = roles.includes("admin") || roles.includes("manager");

    const [kidsRes, contractRes, attemptsRes] = await Promise.all([
      context.supabase.from("lead_children").select("*").eq("lead_id", data.leadId).order("sort_order").order("created_at"),
      context.supabase.from("lead_contracts").select("*").eq("lead_id", data.leadId).eq("is_active", true).maybeSingle(),
      context.supabase
        .from("lead_contact_attempts").select("*").eq("lead_id", data.leadId)
        .order("attempted_at", { ascending: false }).limit(200),
    ]);

    let legal: any = null;
    let files: any[] = [];
    if (privileged) {
      const lRes = await context.supabase.from("lead_legal_data").select("*").eq("lead_id", data.leadId).maybeSingle();
      legal = lRes.data ?? null;
      if (contractRes.data) {
        const fRes = await context.supabase
          .from("lead_contract_files").select("*")
          .eq("lead_contract_id", (contractRes.data as any).id)
          .order("created_at", { ascending: false });
        files = fRes.data ?? [];
      }
    }

    return {
      privileged,
      isAdmin: roles.includes("admin"),
      legal,
      children: kidsRes.data ?? [],
      contract: contractRes.data ?? null,
      files,
      attempts: attemptsRes.data ?? [],
    };
  });

// ---------------------------------------------------------------------------
// legal data (restricted)
// ---------------------------------------------------------------------------

const LegalSchema = z.object({
  lead_id: uuid,
  last_name: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  patronymic: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  tax_id: z.string().max(20).nullable().optional(),
  registered_address: z.string().nullable().optional(),
  actual_address: z.string().nullable().optional(),
  same_address: z.boolean().optional(),
  doc_type: z.string().nullable().optional(),
  doc_series: z.string().max(20).nullable().optional(),
  doc_number: z.string().max(40).nullable().optional(),
  doc_record_number: z.string().max(40).nullable().optional(),
  doc_issuer: z.string().nullable().optional(),
  doc_issue_date: z.string().nullable().optional(),
  doc_expiry_date: z.string().nullable().optional(),
  doc_notes: z.string().nullable().optional(),
});

export const saveLeadLegal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LegalSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const payload: any = { ...data };
    if (payload.same_address) payload.actual_address = payload.registered_address ?? null;
    if (payload.tax_id && !/^\d{8,12}$/.test(payload.tax_id)) {
      throw new Error("РНОКПП має містити 8–12 цифр");
    }
    const { error } = await context.supabase
      .from("lead_legal_data").upsert(payload, { onConflict: "lead_id" });
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "note_added", { section: "legal", action: "saved" });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// children on the lead (+ tariff snapshot)
// ---------------------------------------------------------------------------

const ChildSchema = z.object({
  id: uuid.optional(),
  lead_id: uuid,
  last_name: z.string().nullable().optional(),
  first_name: z.string().min(1, "Ім'я обов'язкове"),
  patronymic: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  planned_start_date: z.string().nullable().optional(),
  branch_id: uuid.nullable().optional(),
  group_id: uuid.nullable().optional(),
  service_id: uuid.nullable().optional(),
  notes: z.string().nullable().optional(),
  plan_id: uuid.nullable().optional(),
  price_version_id: uuid.nullable().optional(),
  base_price: z.number().nullable().optional(),
  discount_type: z.enum(["percentage", "fixed"]).nullable().optional(),
  discount_value: z.number().min(0).optional(),
  discount_reason: z.string().nullable().optional(),
  agreed_at: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const saveLeadChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChildSchema.parse(d))
  .handler(async ({ context, data }) => {
    const roles = await getRoles(context);
    if (!roles.length) throw new Error("Недостатньо прав");

    const { id, ...rest } = data;
    const discountValue = Number(rest.discount_value ?? 0);
    if (discountValue > 0 && !rest.discount_reason?.trim()) {
      throw new Error("Знижка потребує обґрунтування");
    }
    if (rest.discount_type === "percentage" && discountValue > 100) {
      throw new Error("Відсоток знижки не може перевищувати 100%");
    }

    // Base price is snapshotted from the selected price version so later price
    // list changes never rewrite an agreed tariff.
    let base = rest.base_price ?? null;
    if (rest.price_version_id) {
      const { data: pv } = await context.supabase
        .from("price_versions").select("monthly_price, plan_id").eq("id", rest.price_version_id).maybeSingle();
      if (pv) base = Number(pv.monthly_price);
    }
    const final = base === null ? null : computeFinalPrice(base, rest.discount_type, discountValue);

    const row: any = { ...rest, base_price: base, discount_value: discountValue, final_price: final };

    if (id) {
      const { data: prev } = await context.supabase
        .from("lead_children").select("discount_value, discount_type, approved_by").eq("id", id).maybeSingle();
      // Any change to the discount invalidates a previous approval.
      const changed =
        Number((prev as any)?.discount_value ?? 0) !== discountValue ||
        ((prev as any)?.discount_type ?? null) !== (rest.discount_type ?? null);
      if (changed) row.approved_by = null;
      const { error } = await context.supabase.from("lead_children").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      await logTimeline(context, data.lead_id, "note_added", { section: "child", action: "updated", child: id });
      return { ok: true, id };
    }
    const { data: created, error } = await context.supabase
      .from("lead_children").insert(row).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "note_added", { section: "child", action: "added" });
    return { ok: true, id: created?.id };
  });

export const deleteLeadChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: row } = await context.supabase
      .from("lead_children").select("lead_id, converted_child_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Запис не знайдено");
    if ((row as any).converted_child_id) throw new Error("Дитину вже конвертовано — видалення заборонено");
    const { error } = await context.supabase.from("lead_children").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logTimeline(context, (row as any).lead_id, "note_added", { section: "child", action: "deleted" });
    return { ok: true };
  });

export const approveLeadChildDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("lead_children").select("lead_id, discount_value, discount_reason").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Запис не знайдено");
    if (!Number((row as any).discount_value)) throw new Error("Знижки немає — погодження не потрібне");
    const { error } = await context.supabase
      .from("lead_children")
      .update({ approved_by: context.userId, agreed_at: new Date().toISOString().slice(0, 10) })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logTimeline(context, (row as any).lead_id, "note_added", {
      section: "tariff", action: "discount_approved", reason: (row as any).discount_reason,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// communication
// ---------------------------------------------------------------------------

export const logContactAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      channel: z.enum(["call", "sms", "messenger", "email", "other"]),
      outcome: z.enum(["reached", "no_answer", "wrong_number", "declined", "other"]),
      notes: z.string().nullable().optional(),
      attempted_at: z.string().optional(),
      next_action_at: z.string().nullable().optional(),
      next_action_note: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("lead_contact_attempts").insert({
      lead_id: data.lead_id,
      channel: data.channel,
      outcome: data.outcome,
      notes: data.notes ?? null,
      attempted_at: data.attempted_at ?? new Date().toISOString(),
      created_by: context.userId,
    } as any);
    if (error) throw new Error(error.message);

    const { data: lead } = await context.supabase
      .from("leads").select("contact_attempt_count").eq("id", data.lead_id).maybeSingle();
    const patch: any = { contact_attempt_count: Number((lead as any)?.contact_attempt_count ?? 0) + 1 };
    if (data.next_action_at !== undefined) patch.next_action_at = data.next_action_at;
    if (data.next_action_note !== undefined) patch.next_action_note = data.next_action_note;
    await context.supabase.from("leads").update(patch).eq("id", data.lead_id);

    await logTimeline(context, data.lead_id, "note_added", {
      section: "communication", channel: data.channel, outcome: data.outcome,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// status transitions with required next action / closing reason
// ---------------------------------------------------------------------------

export const changeLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      status: z.string().min(1),
      next_action_at: z.string().nullable().optional(),
      next_action_note: z.string().nullable().optional(),
      close_reason_code: z.string().nullable().optional(),
      close_reason_comment: z.string().nullable().optional(),
      visit_at: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: st, error: sErr } = await context.supabase
      .from("lead_statuses")
      .select("code, is_active, category, requires_next_action, requires_closing_reason")
      .eq("code", data.status).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!st) throw new Error(`Невідомий статус: ${data.status}`);
    if (!(st as any).is_active) throw new Error("Цей статус неактивний і не може бути призначений");
    if ((st as any).category === "converted") {
      throw new Error("Статус «Конвертовано» встановлюється лише через конвертацію ліда");
    }

    const { data: prev } = await context.supabase
      .from("leads").select("status, converted_client_id").eq("id", data.lead_id).maybeSingle();
    if (!prev) throw new Error("Лід не знайдено");
    if ((prev as any).converted_client_id) throw new Error("Лід уже конвертовано — статус змінити не можна");

    if ((st as any).requires_next_action && !data.next_action_at) {
      throw new Error("Для цього статусу потрібна наступна дія (дата)");
    }
    if ((st as any).requires_closing_reason && !data.close_reason_code) {
      throw new Error("Для цього статусу потрібна причина закриття");
    }

    const patch: any = { status: data.status };
    if (data.next_action_at !== undefined) patch.next_action_at = data.next_action_at;
    if (data.next_action_note !== undefined) patch.next_action_note = data.next_action_note;
    if (data.visit_at !== undefined) patch.visit_at = data.visit_at;
    if ((st as any).category === "closed") {
      patch.close_reason_code = data.close_reason_code ?? null;
      patch.close_reason_comment = data.close_reason_comment ?? null;
      patch.closed_at = new Date().toISOString();
      patch.closed_by = context.userId;
    } else {
      patch.close_reason_code = null;
      patch.close_reason_comment = null;
      patch.closed_at = null;
      patch.closed_by = null;
    }

    const { error } = await context.supabase.from("leads").update(patch).eq("id", data.lead_id);
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "status_changed", {
      from: (prev as any).status, to: data.status, reason: data.close_reason_code ?? null,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// contract file lifecycle (attach -> finalize -> send -> sign)
// ---------------------------------------------------------------------------

export const upsertLeadContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      number: z.string().nullable().optional(),
      contract_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: lead } = await context.supabase.from("leads").select("branch_id").eq("id", data.lead_id).maybeSingle();
    const { data: existing } = await context.supabase
      .from("lead_contracts").select("id, status").eq("lead_id", data.lead_id).eq("is_active", true).maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("lead_contracts")
        .update({ number: data.number ?? null, contract_date: data.contract_date ?? null })
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { ok: true, id: (existing as any).id };
    }
    const { data: created, error } = await context.supabase
      .from("lead_contracts")
      .insert({
        lead_id: data.lead_id,
        branch_id: (lead as any)?.branch_id ?? null,
        number: data.number ?? null,
        contract_date: data.contract_date ?? null,
        status: "draft",
      } as any)
      .select("id").maybeSingle();
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "contract_generated", { action: "created" });
    return { ok: true, id: created?.id };
  });

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export const attachLeadContractFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      kind: z.enum(["draft", "final", "signed"]),
      path: z.string().min(1),
      filename: z.string().min(1).max(255),
      mime: z.string().min(1),
      size: z.number().int().positive().max(25 * 1024 * 1024),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    if (!ALLOWED_MIME.includes(data.mime)) throw new Error("Дозволені лише файли .pdf або .docx");

    const { data: contract } = await context.supabase
      .from("lead_contracts").select("id, status").eq("lead_id", data.lead_id).eq("is_active", true).maybeSingle();
    if (!contract) throw new Error("Спочатку створіть картку договору");
    if (data.kind === "draft" && (contract as any).status === "final") {
      throw new Error("Договір фіналізовано — чернетку замінити не можна");
    }

    const patch: any = {
      [`${data.kind}_path`]: data.path,
      [`${data.kind}_filename`]: data.filename,
      [`${data.kind}_mime`]: data.mime,
      [`${data.kind}_size`]: data.size,
      uploaded_by: context.userId,
      uploaded_at: new Date().toISOString(),
    };
    const { error } = await context.supabase.from("lead_contracts").update(patch).eq("id", (contract as any).id);
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_contract_files").insert({
      lead_contract_id: (contract as any).id,
      kind: data.kind,
      path: data.path,
      filename: data.filename,
      mime: data.mime,
      size: data.size,
      uploaded_by: context.userId,
    } as any);

    await logTimeline(context, data.lead_id, "contract_generated", { action: "file_attached", kind: data.kind });
    return { ok: true };
  });

export const finalizeLeadContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lead_id: string }) => z.object({ lead_id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: c } = await context.supabase
      .from("lead_contracts").select("*").eq("lead_id", data.lead_id).eq("is_active", true).maybeSingle();
    if (!c) throw new Error("Договір не знайдено");
    const row = c as any;
    if (!row.final_path && !row.draft_path) throw new Error("Прикріпіть файл договору перед фіналізацією");
    if (!row.number?.trim()) throw new Error("Вкажіть номер договору");
    if (!row.contract_date) throw new Error("Вкажіть дату договору");

    const patch: any = { status: "final", finalized_by: context.userId, finalized_at: new Date().toISOString() };
    if (!row.final_path) {
      // Promote the draft to the final version — the same file, marked immutable.
      patch.final_path = row.draft_path;
      patch.final_filename = row.draft_filename;
      patch.final_mime = row.draft_mime;
      patch.final_size = row.draft_size;
    }
    const { error } = await context.supabase.from("lead_contracts").update(patch).eq("id", row.id);
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "contract_generated", { action: "finalized" });
    return { ok: true };
  });

export const recordLeadContractSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      to_email: z.string().email("Некоректний email"),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: c } = await context.supabase
      .from("lead_contracts").select("id, status").eq("lead_id", data.lead_id).eq("is_active", true).maybeSingle();
    if (!c) throw new Error("Договір не знайдено");
    if ((c as any).status !== "final") throw new Error("Надсилати можна лише фіналізований договір");

    const { error } = await context.supabase.from("lead_contracts").update({
      sent_by: context.userId,
      sent_at: new Date().toISOString(),
      sent_to_email: data.to_email,
      email_subject: data.subject,
      email_body: data.body,
      email_result: "recorded",
      email_error: null,
    }).eq("id", (c as any).id);
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "note_added", {
      section: "contract", action: "sent", to: data.to_email,
    });
    return { ok: true };
  });

export const recordLeadContractSigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      lead_id: uuid,
      signed_date: z.string().min(1, "Потрібна дата підписання"),
      is_physical: z.boolean().optional(),
      comment: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: c } = await context.supabase
      .from("lead_contracts").select("id, status").eq("lead_id", data.lead_id).eq("is_active", true).maybeSingle();
    if (!c) throw new Error("Договір не знайдено");
    if ((c as any).status !== "final") throw new Error("Спочатку фіналізуйте договір");

    const { error } = await context.supabase.from("lead_contracts").update({
      signed_date: data.signed_date,
      signature_is_physical: data.is_physical ?? false,
      signature_comment: data.comment ?? null,
      signature_recorded_by: context.userId,
      signature_recorded_at: new Date().toISOString(),
    }).eq("id", (c as any).id);
    if (error) throw new Error(error.message);
    await logTimeline(context, data.lead_id, "note_added", { section: "contract", action: "signed" });
    return { ok: true };
  });

export const getLeadContractFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string }) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: signed, error } = await context.supabase.storage
      .from("lead-contracts").createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

// ---------------------------------------------------------------------------
// conversion + true delete
// ---------------------------------------------------------------------------

export const convertLeadAtomic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lead_id: uuid, existing_client_id: uuid.nullable().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertPrivileged(context);
    const { data: res, error } = await (context.supabase as any).rpc("convert_lead_to_client_v2", {
      _lead_id: data.lead_id,
      _existing_client_id: data.existing_client_id ?? null,
    });
    if (error) throw new Error(error.message);
    return res as { client_id: string; child_ids: string[]; contract_id: string; lead_contract_id: string };
  });

export const findClientMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lead_id: string }) => z.object({ lead_id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: lead } = await context.supabase
      .from("leads").select("parent_phone, parent_email, branch_id").eq("id", data.lead_id).maybeSingle();
    if (!lead) return [];
    const l = lead as any;
    const ors: string[] = [];
    if (l.parent_phone) ors.push(`phone.eq.${l.parent_phone}`);
    if (l.parent_email) ors.push(`email.eq.${l.parent_email}`);
    if (!ors.length) return [];
    const { data: rows } = await context.supabase
      .from("clients")
      .select("id, parent_first_name, parent_last_name, phone, email, status")
      .or(ors.join(","))
      .limit(10);
    return rows ?? [];
  });

export const hardDeleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { data: lead } = await context.supabase
      .from("leads").select("id, status, converted_client_id").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Лід не знайдено або вже видалено");
    if ((lead as any).converted_client_id || (lead as any).status === "converted") {
      throw new Error("Конвертований лід видалити не можна — він пов'язаний з клієнтом");
    }
    const { data: rows, error } = await context.supabase
      .from("leads").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Лід не знайдено або вже видалено");
    return { ok: true, id: rows[0].id };
  });
