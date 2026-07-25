import { useState } from "react";
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
import { getClientFinance, recordPayment } from "@/lib/finance.functions";

export function FinanceTab({ clientId, branchId }: { clientId: string; branchId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getClientFinance);
  const payFn = useServerFn(recordPayment);
  const { data, isLoading } = useQuery({
    queryKey: ["client-finance", clientId],
    queryFn: () => getFn({ data: { clientId } }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", paid_at: new Date().toISOString().slice(0, 10), payment_method_id: "", note: "" });

  const record = useMutation({
    mutationFn: () => payFn({ data: {
      client_id: clientId, branch_id: branchId,
      amount: Number(form.amount), paid_at: form.paid_at,
      payment_method_id: form.payment_method_id || null, note: form.note || null,
    } }),
    onSuccess: (res: any) => {
      toast.success(`Платіж проведено${res.credited ? ` · кредит ${res.credited} ₴` : ""}`);
      setShowForm(false); setForm({ amount: "", paid_at: new Date().toISOString().slice(0, 10), payment_method_id: "", note: "" });
      qc.invalidateQueries({ queryKey: ["client-finance", clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Завантаження...</p>;

  const charges = data.charges;
  const payments = data.payments;
  const totalCharged = charges.filter((c: any) => c.status !== "cancelled").reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalPaid = charges.reduce((s: number, c: any) => s + Number(c.paid_amount ?? 0), 0);
  const debt = Math.max(0, totalCharged - totalPaid);
  const creditsTotal = (data.credits ?? []).reduce((s: number, c: any) => s + Number(c.amount_remaining), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <KPI label="Нараховано" value={totalCharged} />
        <KPI label="Оплачено" value={totalPaid} tone="text-emerald-600" />
        <KPI label="Борг" value={debt} tone={debt > 0 ? "text-destructive" : ""} />
        <KPI label="Кредит" value={creditsTotal} tone={creditsTotal > 0 ? "text-primary" : ""} />
      </div>

      <SectionCard title="Нарахування" description="Автоматично з підтвердженого договору. Оплачені не змінюються.">
        {charges.length === 0 ? <p className="text-sm text-muted-foreground">Ще немає нарахувань</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Період</th><th className="py-2 pr-4">Термін</th><th className="py-2 pr-4 text-right">Сума</th><th className="py-2 pr-4 text-right">Оплачено</th><th className="py-2 pr-4">Статус</th></tr></thead>
              <tbody>{charges.map((c: any) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{format(new Date(c.period_month), "LLL yyyy")}{c.is_prorated ? " •пр" : ""}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{c.due_date ?? "—"}</td>
                  <td className="py-1.5 pr-4 text-right">{Number(c.amount).toFixed(0)} ₴</td>
                  <td className="py-1.5 pr-4 text-right">{Number(c.paid_amount ?? 0).toFixed(0)} ₴</td>
                  <td className="py-1.5 pr-4"><ChargeBadge status={c.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Платежі" description="FIFO розподіл на найстаріші нарахування. Залишок стає кредитом.">
        <div className="mb-3 flex justify-end">
          {!showForm ? <PrimaryButton onClick={() => setShowForm(true)}>Прийняти платіж</PrimaryButton> : null}
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
              </div>
              <div className="md:col-span-4"><Label className="text-xs">Нотатка</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Скасувати</Button>
              <PrimaryButton onClick={() => record.mutate()} disabled={record.isPending || !Number(form.amount)}>Провести</PrimaryButton>
            </div>
          </div>
        ) : null}
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">Платежів ще не було</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Дата</th><th className="py-2 pr-4 text-right">Сума</th><th className="py-2 pr-4">Метод</th><th className="py-2 pr-4">Статус</th><th className="py-2 pr-4">Нотатка</th></tr></thead>
              <tbody>{payments.map((p: any) => {
                const method = data.methods.find((m: any) => m.id === p.payment_method_id);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{format(new Date(p.paid_at), "dd.MM.yyyy")}</td>
                    <td className="py-1.5 pr-4 text-right font-medium">{Number(p.amount).toFixed(0)} ₴</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{method?.name ?? "—"}</td>
                    <td className="py-1.5 pr-4"><StatusBadge tone={p.status === "void" ? "neutral" : "success"}>{p.status === "void" ? "Скасовано" : "Проведено"}</StatusBadge></td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{p.note ?? "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </SectionCard>
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
