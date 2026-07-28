// Google Form → Bright OS lead intake.
// Public endpoint; each registered form authenticates with a shared secret
// stored server-side as a SHA-256 hash on lead_intake_forms.secret_hash.
//
// Contract:
//   POST /functions/v1/google-form-lead-intake
//   Headers:  x-intake-secret: <plain form secret>
//             content-type: application/json
//   Body:     { form_id, response_id, submitted_at, fields: { <header>: <value> } }
//
// Idempotency: (intake_form_id, external_response_id) is unique. A retry
// returns the original outcome without creating a second lead.
//
// This function never trusts client-supplied branch/service/source — it
// resolves them only from the registration row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intake-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function firstNonEmpty(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (!k) continue;
    const v = fields[k];
    if (v == null) continue;
    const s = String(Array.isArray(v) ? v.join(", ") : v).trim();
    if (s) return s;
  }
  return null;
}

function normalizePhoneUA(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("380")) return "+" + digits;
  if (digits.length === 10 && digits.startsWith("0")) return "+380" + digits.slice(1);
  if (digits.length === 9) return "+380" + digits;
  return "+" + digits;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO / yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // dd.mm.yyyy or dd/mm/yyyy
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const formId = String(body?.form_id ?? "").trim();
  const responseId = String(body?.response_id ?? "").trim();
  const secret = req.headers.get("x-intake-secret") ?? "";
  const submittedAt = body?.submitted_at ? new Date(body.submitted_at).toISOString() : null;
  const fields: Record<string, unknown> = (body?.fields && typeof body.fields === "object") ? body.fields : {};

  if (!formId || !responseId || !secret) return json(400, { error: "missing_required_fields" });

  const { data: reg, error: regErr } = await supabase
    .from("lead_intake_forms")
    .select("id, branch_id, service_id, requested_plan, source_form, secret_hash, field_mapping, is_active")
    .eq("external_form_id", formId)
    .maybeSingle();

  if (regErr) return json(500, { error: "registration_lookup_failed", message: regErr.message });
  if (!reg || !reg.is_active) return json(404, { error: "form_not_registered" });

  const providedHash = await sha256Hex(secret);
  if (!timingSafeEqual(providedHash, String(reg.secret_hash))) {
    // Do not log unauthenticated attempts to avoid event-table pollution.
    return json(401, { error: "invalid_secret" });
  }

  // Idempotency check.
  const { data: existing } = await supabase
    .from("lead_intake_events")
    .select("id, status, lead_id, duplicate_lead_id, error_message")
    .eq("intake_form_id", reg.id)
    .eq("external_response_id", responseId)
    .maybeSingle();
  if (existing) {
    return json(200, {
      ok: true,
      idempotent: true,
      event_id: existing.id,
      status: existing.status,
      lead_id: existing.lead_id,
      duplicate_lead_id: existing.duplicate_lead_id,
    });
  }

  const mapping: Record<string, string | string[]> = (reg.field_mapping ?? {}) as any;
  const keysFor = (target: string): string[] => {
    const out: string[] = [];
    for (const [header, mapped] of Object.entries(mapping)) {
      const mappedArr = Array.isArray(mapped) ? mapped : [mapped];
      if (mappedArr.includes(target)) out.push(header);
    }
    return out;
  };

  const parentFirst = firstNonEmpty(fields, keysFor("parent_first_name"));
  const parentLast = firstNonEmpty(fields, keysFor("parent_last_name"));
  const parentPhoneRaw = firstNonEmpty(fields, keysFor("parent_phone"));
  const parentEmailRaw = firstNonEmpty(fields, keysFor("parent_email"));
  const parentAddress = firstNonEmpty(fields, keysFor("parent_address"));
  const childFirst = firstNonEmpty(fields, keysFor("child_first_name"));
  const childLast = firstNonEmpty(fields, keysFor("child_last_name"));
  const childBirth = parseDate(firstNonEmpty(fields, keysFor("child_birthdate")));
  const desiredStart = parseDate(firstNonEmpty(fields, keysFor("desired_start_date")));
  const notesMain = firstNonEmpty(fields, keysFor("notes"));

  const phone = normalizePhoneUA(parentPhoneRaw);
  const email = normalizeEmail(parentEmailRaw);

  // Metadata that should live in notes only.
  const metaKeysTargets = ["requested_group", "current_preschool", "referral_detail", "child_age"];
  const metaLines: string[] = [];
  if (reg.requested_plan) metaLines.push(`Побажання щодо плану: ${reg.requested_plan}`);
  for (const t of metaKeysTargets) {
    const val = firstNonEmpty(fields, keysFor(t));
    if (val) {
      const label = ({
        requested_group: "Бажана група",
        current_preschool: "Поточний садок",
        referral_detail: "Звідки дізналися",
        child_age: "Вік дитини (заявлений)",
      } as Record<string, string>)[t];
      metaLines.push(`${label}: ${val}`);
    }
  }
  const composedNotes = [notesMain, metaLines.join("\n")].filter(Boolean).join("\n\n") || null;

  const parentName = [parentFirst, parentLast].filter(Boolean).join(" ").trim() || "Без імені";
  const childName = [childFirst, childLast].filter(Boolean).join(" ").trim() || null;

  // Duplicate detection — flag only, never merge.
  let duplicateLeadId: string | null = null;
  if (phone || email) {
    const orParts: string[] = [];
    if (phone) orParts.push(`parent_phone.eq.${phone}`);
    if (email) orParts.push(`parent_email.eq.${email}`);
    const { data: dupLead } = await supabase
      .from("leads")
      .select("id")
      .eq("branch_id", reg.branch_id)
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dupLead?.id) duplicateLeadId = dupLead.id;
    if (!duplicateLeadId) {
      const { data: dupClient } = await supabase
        .from("clients")
        .select("id")
        .eq("branch_id", reg.branch_id)
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();
      if (dupClient?.id) {
        // Client duplicate found — we don't have a lead ref, note it in raw_payload only.
      }
    }
  }

  const leadRow = {
    branch_id: reg.branch_id,
    service_id: reg.service_id,
    parent_name: parentName,
    parent_first_name: parentFirst,
    parent_last_name: parentLast,
    parent_phone: phone,
    parent_email: email,
    parent_address: parentAddress,
    child_name: childName,
    child_first_name: childFirst,
    child_last_name: childLast,
    child_birthdate: childBirth,
    desired_start_date: desiredStart,
    status: "new" as const,
    source: "google" as const,
    source_form: reg.source_form,
    registration_date: (submittedAt ?? new Date().toISOString()).slice(0, 10),
    notes: composedNotes,
  };

  const { data: createdLead, error: leadErr } = await supabase
    .from("leads")
    .insert(leadRow)
    .select("id")
    .maybeSingle();

  if (leadErr || !createdLead) {
    const { data: evt } = await supabase
      .from("lead_intake_events")
      .insert({
        intake_form_id: reg.id,
        external_response_id: responseId,
        submitted_at: submittedAt,
        status: "error",
        raw_payload: body,
        error_message: leadErr?.message ?? "lead_insert_failed",
      })
      .select("id")
      .maybeSingle();
    return json(500, { error: "lead_insert_failed", message: leadErr?.message, event_id: evt?.id });
  }

  await supabase.from("timeline_events").insert({
    lead_id: createdLead.id,
    type: "lead_created",
    payload: { source: "google_form", form_id: formId, response_id: responseId, duplicate_lead_id: duplicateLeadId },
  });

  const { data: evt } = await supabase
    .from("lead_intake_events")
    .insert({
      intake_form_id: reg.id,
      external_response_id: responseId,
      submitted_at: submittedAt,
      status: duplicateLeadId ? "duplicate" : "created",
      lead_id: createdLead.id,
      duplicate_lead_id: duplicateLeadId,
      raw_payload: body,
    })
    .select("id")
    .maybeSingle();

  return json(200, {
    ok: true,
    event_id: evt?.id,
    lead_id: createdLead.id,
    status: duplicateLeadId ? "duplicate" : "created",
    duplicate_lead_id: duplicateLeadId,
  });
});
