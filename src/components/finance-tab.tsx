import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { SectionCard, StatusBadge, PrimaryButton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClientFinance, recordPayment, voidPayment, reallocatePayment } from "@/lib/finance.functions";
import { EmptySelectHint } from "@/components/settings/empty-select-hint";

type Charge = { id: string; period_month: string; amount: number; paid_amount: number; status: string; due_date: string | null; is_prorated: boolean };
type Payment = { id: string; paid_at: string; amount: number; status: string; note: string | null; payment_method_id: string | null };
type Alloc = { id: string; payment_id: string; charge_id: string; amount: number };

export function FinanceTab({ clientId, branchId }: { clientId: string; branchId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getClientFinance);
  const payFn = useServerFn(recordPayment);
  const voidFn = useServerFn(voidPayment);
  const reallocFn = useServerFn(reallocatePayment);
  const { data, isLoading } = useQuery({
    queryKey: ["client-finance", clientId],
    queryFn: () => getFn({ data: { clientId } }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", paid_at: new Date().toISOString().slice(0, 10), payment_method_id: "", note: "" });
  const [reallocFor, setReallocFor] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-finance", clientId] });
    qc.invalidateQueries({ queryKey: ["client", clientId] });
  };

  const record = useMutation({
    mutationFn: () => payFn({ data: {
      client_id: clientId, branch_id: branchId,
      amount: Number(form.amount), paid_at: form.paid_at,
      payment_method_id: form.payment_method_id || null, note: form.note || null,
    } }),
    onSuccess: (res: any) => {
      toast.success(`Платіж проведено${res.credited ? ` · кредит ${res.credited} ₴` : ""}`);
      setShowForm(false); setForm({ amount: "", paid_at: new Date().toISOString().slice(0, 10), payment_method_id: "", note: "" });
      invalidate();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id } }),
    onSuccess: () => { toast.success("Платіж скасовано"); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  // FIFO preview of how the current amount would be allocated.
  const openCharges = useMemo(() => {
    if (!data) return [] as Charge[];
    return (data.charges as Charge[])
      .filter((c) => ["pending", "partial", "overdue"].includes(c.status))
      .sort((a, b) => a.period_month.localeCompare(b.period_month));
  }, [data]);

  const preview = useMemo(() => {
    const amt = Number(form.amount) || 0;
    if (amt <= 0) return { rows: [] as { charge: Charge; take: number }[], credit: 0 };
    let remaining = amt;
    const rows: { charge: Charge; take: number }[] = [];
    for (const c of openCharges) {
      if (remaining <= 0.005) break;
      const need = Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0));
      if (need <= 0) continue;
      const take = Math.min(need, remaining);
      rows.push({ charge: c, take });
      remaining -= take;
    }
    return { rows, credit: Math.max(0, Math.round(remaining * 100) / 100) };
  }, [form.amount, openCharges]);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Завантаження...</p>;

  const charges: Charge[] = data.charges;
  const payments: Payment[] = data.payments;
  const allocations: Alloc[] = data.allocations ?? [];
  const totalCharged = charges.filter((c) => c.status !== "cancelled").reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = charges.reduce((s, c) => s + Number(c.paid_amount ?? 0), 0);
  const debt = Math.max(0, totalCharged - totalPaid);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = charges
    .filter((c) => ["pending", "partial", "overdue"].includes(c.status) && c.due_date && c.due_date < today)
    .reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0)), 0);
  const creditsTotal = (data.credits ?? []).reduce((s: number, c: any) => s + Number(c.amount_remaining), 0);

  const allocsByPayment = new Map<string, Alloc[]>();
  for (const a of allocations) {
    const arr = allocsByPayment.get(a.payment_id) ?? [];
    arr.push(a); allocsByPayment.set(a.payment_id, arr);
  }
  const chargeById = new Map(charges.map((c) => [c.id, c] as const));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <KPI label="Нараховано" value={totalCharged} />
        <KPI label="Оплачено" value={totalPaid} tone="text-emerald-600" />
        <KPI label="Борг" value={debt} tone={debt > 0 ? "text-destructive" : ""} />
        <KPI label="Прострочено" value={overdue} tone={overdue > 0 ? "text-destructive" : ""} />
        <KPI label="Кредит" value={creditsTotal} tone={creditsTotal > 0 ? "text-primary" : ""} />
      </div>

      {creditsTotal > 0 ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <strong>Нерозподілений кредит:</strong> {creditsTotal.toFixed(0)} ₴ — буде автоматично використано при наступному нарахуванні або через перерозподіл платежу.
        </div>
      ) : null}

      <SectionCard title="Нарахування" description="Автоматично з підтвердженого договору. Оплачені не змінюються.">
        {charges.length === 0 ? <p className="text-sm text-muted-foreground">Ще немає нарахувань</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Період</th>
                <th className="py-2 pr-4">Термін</th>
                <th className="py-2 pr-4 text-right">Нараховано</th>
                <th className="py-2 pr-4 text-right">Оплачено</th>
                <th className="py-2 pr-4 text-right">Залишок</th>
                <th className="py-2 pr-4">Статус</th>
              </tr></thead>
              <tbody>{charges.map((c) => {
                const remaining = Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0));
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{format(new Date(c.period_month), "LLL yyyy")}{c.is_prorated ? " •пр" : ""}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{c.due_date ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-right">{Number(c.amount).toFixed(0)} ₴</td>
                    <td className="py-1.5 pr-4 text-right">{Number(c.paid_amount ?? 0).toFixed(0)} ₴</td>
                    <td className="py-1.5 pr-4 text-right">{remaining.toFixed(0)} ₴</td>
                    <td className="py-1.5 pr-4"><ChargeBadge status={c.status} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Платежі" description="Прийом платежів клієнта. Кошти автоматично розподіляються FIFO на найстаріші відкриті нарахування; надлишок стає кредитом клієнта.">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Це основна точка вводу оплат від клієнта. Ті самі дії доступні у <strong>Розрахунки</strong>.
          </p>
          {!showForm ? <PrimaryButton onClick={() => setShowForm(true)}>Додати платіж</PrimaryButton> : null}
        </div>
        {showForm ? (
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label className="text-xs">Сума (₴)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label className="text-xs">Дата</Label><Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></div>
              <div><Label className="text-xs">Метод</Label>
                <Select value={form.payment_method_id} onValueChange={(v) => setForm({ ...form, payment_method_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(data.methods ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
                {(data.methods ?? []).length === 0 ? <EmptySelectHint to="/admin/payment-methods" label="Створити метод оплати" /> : null}
              </div>
              <div className="md:col-span-4"><Label className="text-xs">Нотатка</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            </div>
            {Number(form.amount) > 0 ? (
              <div className="mt-3 rounded-md border border-border bg-background p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Попередній розподіл (FIFO):</p>
                {preview.rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Немає відкритих нарахувань — уся сума піде у кредит.</p>
                ) : (
                  <ul className="text-xs space-y-0.5">
                    {preview.rows.map((r) => (
                      <li key={r.charge.id} className="flex justify-between">
                        <span>{format(new Date(r.charge.period_month), "LLL yyyy")}</span>
                        <span className="font-medium">{r.take.toFixed(0)} ₴</span>
                      </li>
                    ))}
                    {preview.credit > 0 ? (
                      <li className="flex justify-between border-t pt-1 mt-1 text-amber-600">
                        <span>Кредит клієнта</span><span className="font-medium">{preview.credit.toFixed(0)} ₴</span>
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Скасувати</Button>
              <PrimaryButton onClick={() => record.mutate()} disabled={record.isPending || !Number(form.amount)}>Провести</PrimaryButton>
            </div>
          </div>
        ) : null}
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">Платежів ще не було</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4 text-right">Сума</th>
                <th className="py-2 pr-4">Метод</th>
                <th className="py-2 pr-4">Розподіл</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2 pr-4"></th>
              </tr></thead>
              <tbody>{payments.map((p) => {
                const method = (data.methods ?? []).find((m: any) => m.id === p.payment_method_id);
                const pa = allocsByPayment.get(p.id) ?? [];
                const allocSum = pa.reduce((s, a) => s + Number(a.amount), 0);
                const credit = Math.max(0, Number(p.amount) - allocSum);
                return (
                  <tr key={p.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-4">{format(new Date(p.paid_at), "dd.MM.yyyy")}</td>
                    <td className="py-1.5 pr-4 text-right font-medium">{Number(p.amount).toFixed(0)} ₴</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{method?.name ?? "—"}</td>
                    <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                      {pa.length === 0 && p.status !== "void" ? <span className="text-amber-600">Кредит: {credit.toFixed(0)} ₴</span> :
                        p.status === "void" ? "—" : (
                          <div className="space-y-0.5">
                            {pa.map((a) => {
                              const c = chargeById.get(a.charge_id);
                              return <div key={a.id}>{c ? format(new Date(c.period_month), "LLL yyyy") : "?"}: {Number(a.amount).toFixed(0)} ₴</div>;
                            })}
                            {credit > 0.005 ? <div className="text-amber-600">+ кредит {credit.toFixed(0)} ₴</div> : null}
                          </div>
                        )}
                    </td>
                    <td className="py-1.5 pr-4"><StatusBadge tone={p.status === "void" ? "neutral" : "success"}>{p.status === "void" ? "Скасовано" : "Проведено"}</StatusBadge></td>
                    <td className="py-1.5 pr-4">
                      {p.status === "posted" ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setReallocFor(reallocFor === p.id ? null : p.id)}>Перерозподіл</Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Скасувати платіж?")) voidMut.mutate(p.id); }}>Void</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {reallocFor ? (
          <ReallocEditor
            payment={payments.find((p) => p.id === reallocFor)!}
            charges={charges}
            current={allocsByPayment.get(reallocFor) ?? []}
            onCancel={() => setReallocFor(null)}
            onSave={async (rows) => {
              try {
                await reallocFn({ data: { payment_id: reallocFor, allocations: rows } });
                toast.success("Розподіл оновлено");
                setReallocFor(null);
                invalidate();
              } catch (e: any) { toast.error("Помилка", { description: e.message }); }
            }}
          />
        ) : null}
      </SectionCard>
    </div>
  );
}

function ReallocEditor({ payment, charges, current, onCancel, onSave }: {
  payment: Payment;
  charges: Charge[];
  current: Alloc[];
  onCancel: () => void;
  onSave: (rows: { charge_id: string; amount: number }[]) => void;
}) {
  const currentMap = new Map(current.map((a) => [a.charge_id, Number(a.amount)]));
  const eligible = charges
    .filter((c) => c.status !== "cancelled")
    .sort((a, b) => a.period_month.localeCompare(b.period_month));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(eligible.map((c) => [c.id, String(currentMap.get(c.id) ?? "")]))
  );
  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
  const overshoot = total > Number(payment.amount) + 0.005;
  const credit = Math.max(0, Number(payment.amount) - total);

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="mb-2 text-sm font-medium">Перерозподіл платежу від {format(new Date(payment.paid_at), "dd.MM.yyyy")} ({Number(payment.amount).toFixed(0)} ₴)</p>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th>Період</th><th className="text-right">Нараховано</th><th className="text-right">Залишок</th><th className="text-right">До розподілу</th></tr></thead>
          <tbody>{eligible.map((c) => {
            const paidElsewhere = Number(c.paid_amount ?? 0) - (currentMap.get(c.id) ?? 0);
            const availableRemaining = Number(c.amount) - paidElsewhere;
            return (
              <tr key={c.id} className="border-t">
                <td className="py-1">{format(new Date(c.period_month), "LLL yyyy")}</td>
                <td className="py-1 text-right">{Number(c.amount).toFixed(0)}</td>
                <td className="py-1 text-right text-muted-foreground">{availableRemaining.toFixed(0)}</td>
                <td className="py-1 text-right">
                  <Input className="w-24 h-7 text-right ml-auto" type="number" value={values[c.id] ?? ""} onChange={(e) => setValues({ ...values, [c.id]: e.target.value })} />
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={overshoot ? "text-destructive" : "text-muted-foreground"}>
          Розподілено: {total.toFixed(0)} ₴ · Кредит: {credit.toFixed(0)} ₴
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Скасувати</Button>
          <PrimaryButton
            disabled={overshoot}
            onClick={() => {
              const rows = Object.entries(values)
                .map(([charge_id, v]) => ({ charge_id, amount: Number(v) || 0 }))
                .filter((r) => r.amount > 0);
              onSave(rows);
            }}
          >Зберегти</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${tone}`}>{value.toFixed(0)} ₴</p></div>;
}
function ChargeBadge({ status }: { status: string }) {
  const m: Record<string, { tone: any; label: string }> = {
    pending: { tone: "warning", label: "До оплати" },
    partial: { tone: "info", label: "Частково" },
    paid: { tone: "success", label: "Оплачено" },
    overdue: { tone: "danger", label: "Прострочено" },
    cancelled: { tone: "neutral", label: "Скасовано" },
  };
  const s = m[status] ?? { tone: "neutral" as const, label: status };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
