import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Baby, Check, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { SectionCard, PrimaryButton, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { listLookups } from "@/lib/lookups.functions";
import { approveLeadChildDiscount, deleteLeadChild, saveLeadChild } from "@/lib/lead-admissions.functions";
import { CHILD_GENDERS, computeFinalPrice, labelOf } from "@/lib/lead-workflow";

const NONE = "__none__";

export function LeadChildrenTab({
  leadId,
  branchId,
  children,
  isAdmin,
  readOnly,
  onChanged,
}: {
  leadId: string;
  branchId: string | null;
  children: any[];
  isAdmin: boolean;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<any | null>(null);
  const qc = useQueryClient();
  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn(), staleTime: 60_000 });
  const approveFn = useServerFn(approveLeadChildDiscount);
  const deleteFn = useServerFn(deleteLeadChild);
  const [confirm, setConfirm] = useState<any | null>(null);

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Знижку погоджено"); onChanged(); qc.invalidateQueries({ queryKey: ["lead-workflow", leadId] }); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Видалено"); setConfirm(null); onChanged(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      {readOnly ? null : (
        <div className="flex justify-end">
          <PrimaryButton onClick={() => setEditing({ lead_id: leadId, branch_id: branchId, discount_value: 0 })}>
            <Plus className="mr-1.5 h-4 w-4" /> Додати дитину
          </PrimaryButton>
        </div>
      )}
      <SectionCard
        title="Діти в заявці"
        description="Дані дітей зберігаються на рівні заявки. Постійні картки дітей створюються лише під час конвертації."
      >
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ще не додано жодної дитини.</p>
        ) : (
          <div className="space-y-3">
            {children.map((c, i) => (
              <div key={c.id} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-sm text-muted-foreground">{i + 1}</span>
                    <Baby className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {[c.last_name, c.first_name, c.patronymic].filter(Boolean).join(" ") || "Без імені"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.birth_date ?? "дата народження —"} · {labelOf(CHILD_GENDERS, c.gender)} · початок:{" "}
                        {c.planned_start_date ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.converted_child_id ? <StatusBadge tone="success">Конвертовано</StatusBadge> : null}
                    {readOnly ? null : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!c.converted_child_id ? (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm(c)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
                  <Kv label="Тариф" value={lookups?.plans?.find((p: any) => p.id === c.plan_id)?.name ?? "—"} />
                  <Kv label="Базова ціна" value={c.base_price != null ? `${c.base_price} ₴` : "—"} />
                  <Kv
                    label="Знижка"
                    value={
                      Number(c.discount_value)
                        ? `${c.discount_value}${c.discount_type === "percentage" ? "%" : " ₴"}`
                        : "—"
                    }
                  />
                  <Kv label="Фінальна ціна" value={c.final_price != null ? `${c.final_price} ₴` : "—"} strong />
                </div>
                {Number(c.discount_value) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Обґрунтування: {c.discount_reason || "—"}</span>
                    {c.approved_by ? (
                      <StatusBadge tone="success">Погоджено</StatusBadge>
                    ) : isAdmin && !readOnly ? (
                      <Button size="sm" variant="outline" onClick={() => approve.mutate(c.id)} disabled={approve.isPending}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Погодити знижку
                      </Button>
                    ) : (
                      <StatusBadge tone="warning">Очікує погодження адміністратора</StatusBadge>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {editing ? (
        <ChildEditor
          value={editing}
          lookups={lookups}
          branchId={branchId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          entityName={[confirm.last_name, confirm.first_name].filter(Boolean).join(" ") || "дитина"}
          impact="Запис дитини буде видалено із заявки."
          isPending={del.isPending}
          onConfirm={() => del.mutateAsync(confirm.id)}
        />
      ) : null}
    </div>
  );
}

function Kv({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-semibold" : ""}>{value}</p>
    </div>
  );
}

function ChildEditor({
  value,
  lookups,
  branchId,
  onClose,
  onSaved,
}: {
  value: any;
  lookups: any;
  branchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<any>({ ...value, discount_value: Number(value.discount_value ?? 0) });
  const saveFn = useServerFn(saveLeadChild);
  const set = (patch: any) => setV((p: any) => ({ ...p, ...patch }));

  const prices = (lookups?.prices ?? []).filter((p: any) => !v.plan_id || p.plan_id === v.plan_id);
  const selectedPrice = prices.find((p: any) => p.id === v.price_version_id);
  const base = selectedPrice ? Number(selectedPrice.monthly_price) : Number(v.base_price ?? 0);
  const final = computeFinalPrice(base, v.discount_type, v.discount_value);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: v.id,
          lead_id: v.lead_id,
          last_name: v.last_name || null,
          first_name: (v.first_name ?? "").trim(),
          patronymic: v.patronymic || null,
          birth_date: v.birth_date || null,
          gender: v.gender || null,
          planned_start_date: v.planned_start_date || null,
          branch_id: v.branch_id || branchId || null,
          group_id: v.group_id || null,
          service_id: v.service_id || null,
          notes: v.notes || null,
          plan_id: v.plan_id || null,
          price_version_id: v.price_version_id || null,
          base_price: base || null,
          discount_type: v.discount_value ? (v.discount_type ?? "percentage") : null,
          discount_value: Number(v.discount_value ?? 0),
          discount_reason: v.discount_reason || null,
          agreed_at: v.agreed_at || null,
        } as any,
      }),
    onSuccess: () => { toast.success("Збережено"); onSaved(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const groups = (lookups?.groups ?? []).filter((g: any) => !branchId || g.branch_id === branchId);
  const services = (lookups?.services ?? []).filter((s: any) => !branchId || s.branch_id === branchId);

  return (
    <SectionCard title={v.id ? "Редагувати дитину" : "Нова дитина"}>
      <div className="grid gap-4 md:grid-cols-3">
        <F label="Прізвище"><Input value={v.last_name ?? ""} onChange={(e) => set({ last_name: e.target.value })} /></F>
        <F label="Ім'я *"><Input value={v.first_name ?? ""} onChange={(e) => set({ first_name: e.target.value })} /></F>
        <F label="По батькові"><Input value={v.patronymic ?? ""} onChange={(e) => set({ patronymic: e.target.value })} /></F>
        <F label="Дата народження"><Input type="date" value={v.birth_date ?? ""} onChange={(e) => set({ birth_date: e.target.value })} /></F>
        <F label="Стать">
          <Sel value={v.gender} onChange={(x) => set({ gender: x })} options={CHILD_GENDERS as any} />
        </F>
        <F label="Планована дата початку">
          <Input type="date" value={v.planned_start_date ?? ""} onChange={(e) => set({ planned_start_date: e.target.value })} />
        </F>
        <F label="Група">
          <Sel value={v.group_id} onChange={(x) => set({ group_id: x })} options={groups.map((g: any) => ({ value: g.id, label: g.name }))} />
        </F>
        <F label="Послуга">
          <Sel value={v.service_id} onChange={(x) => set({ service_id: x })} options={services.map((s: any) => ({ value: s.id, label: s.name }))} />
        </F>
        <F label="Нотатки"><Input value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></F>
      </div>

      <div className="mt-5 rounded-xl border border-border/70 p-4">
        <p className="mb-3 text-sm font-medium">Тариф та ціна</p>
        <div className="grid gap-4 md:grid-cols-3">
          <F label="Тарифний план">
            <Sel
              value={v.plan_id}
              onChange={(x) => set({ plan_id: x, price_version_id: null })}
              options={(lookups?.plans ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
            />
          </F>
          <F label="Версія ціни">
            <Sel
              value={v.price_version_id}
              onChange={(x) => set({ price_version_id: x })}
              options={prices.map((p: any) => ({ value: p.id, label: `${p.name} — ${p.monthly_price} ₴` }))}
            />
          </F>
          <F label="Базова ціна (₴)">
            <Input value={base || ""} readOnly disabled />
          </F>
          <F label="Тип знижки">
            <Sel
              value={v.discount_type}
              onChange={(x) => set({ discount_type: x })}
              options={[{ value: "percentage", label: "Відсоток" }, { value: "fixed", label: "Фіксована сума" }]}
            />
          </F>
          <F label="Розмір знижки">
            <Input
              type="number" min={0}
              value={v.discount_value ?? 0}
              onChange={(e) => set({ discount_value: Number(e.target.value) })}
            />
          </F>
          <F label="Фінальна ціна (₴)">
            <Input value={final} readOnly disabled className="font-semibold" />
          </F>
        </div>
        {Number(v.discount_value) > 0 ? (
          <div className="mt-3">
            <Label className="text-xs">Обґрунтування знижки *</Label>
            <Textarea
              rows={2}
              value={v.discount_reason ?? ""}
              onChange={(e) => set({ discount_reason: e.target.value })}
              placeholder="Причина знижки — обов'язкова, потребує погодження адміністратора"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Скасувати</Button>
        <PrimaryButton onClick={() => save.mutate()} disabled={!v.first_name?.trim() || save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Зберегти
        </PrimaryButton>
      </div>
    </SectionCard>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Sel({
  value,
  onChange,
  options,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(x) => onChange(x === NONE ? null : x)}>
      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
