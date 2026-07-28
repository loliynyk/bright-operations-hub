import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Play, Wallet } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, StatusBadge } from "@/components/ds";
import { KpiGrid } from "@/components/ds/kpi-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBranch } from "@/lib/branch-context";
import {
  listPayrolls,
  generateMonthlyPayroll,
  addPayrollPayment,
  updatePayrollAdjustments,
  listPaymentSources,
} from "@/lib/payroll.functions";

export const Route = createFileRoute("/_authenticated/finance/payroll")({
  component: PayrollWorkspace,
  head: () => ({
    meta: [
      { title: "Зарплати — Bright OS" },
      { name: "description", content: "Місячні розрахунки з працівниками, виплати та залишки." },
    ],
  }),
});

const STATUS_LABEL: Record<string, string> = {
  not_paid: "Не виплачено",
  partial: "Частково",
  paid: "Виплачено",
  overpaid: "Переплата",
};
const STATUS_TONE: Record<string, any> = {
  not_paid: "warning",
  partial: "info",
  paid: "success",
  overpaid: "danger",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
const fmt = (n: any) => Number(n ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₴";

function PayrollWorkspace() {
  const { branch } = useBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listPayrolls);
  const genFn = useServerFn(generateMonthlyPayroll);
  const addPayFn = useServerFn(addPayrollPayment);
  const updAdjFn = useServerFn(updatePayrollAdjustments);
  const sourcesFn = useServerFn(listPaymentSources);

  const [period, setPeriod] = useState(currentMonth());
  const [status, setStatus] = useState<string>("all");
  const [payFor, setPayFor] = useState<any | null>(null);
  const [adjFor, setAdjFor] = useState<any | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payrolls", branch.id, period, status],
    queryFn: () =>
      listFn({
        data: {
          branch_id: branch.id || null,
          period_month: period,
          status: status === "all" ? null : (status as any),
        },
      }),
    enabled: !!branch.id,
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["payroll-sources", branch.id],
    queryFn: () => sourcesFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });

  const gen = useMutation({
    mutationFn: () => genFn({ data: { branch_id: branch.id || null, period_month: period } }),
    onSuccess: (r: any) => {
      toast.success(r.created > 0 ? `Створено ${r.created} записів` : "Записи вже існують");
      qc.invalidateQueries({ queryKey: ["payrolls"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const addPay = useMutation({
    mutationFn: (v: any) => addPayFn({ data: v }),
    onSuccess: () => {
      toast.success("Виплату додано");
      setPayFor(null);
      qc.invalidateQueries({ queryKey: ["payrolls"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const updAdj = useMutation({
    mutationFn: (v: any) => updAdjFn({ data: v }),
    onSuccess: () => {
      toast.success("Оновлено");
      setAdjFor(null);
      qc.invalidateQueries({ queryKey: ["payrolls"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const totals = useMemo(() => {
    const list = rows as any[];
    return list.reduce(
      (acc, r) => {
        acc.to_pay += Number(r.amount_to_pay ?? 0);
        acc.paid += Number(r.amount_paid ?? 0);
        acc.outstanding += Number(r.amount_outstanding ?? 0);
        acc.count += 1;
        return acc;
      },
      { to_pay: 0, paid: 0, outstanding: 0, count: 0 },
    );
  }, [rows]);

  return (
    <PageContainer>
      <PageHeader
        title="Зарплати"
        description="Місячні розрахунки, виплати та залишки по працівниках."
        actions={
          <div className="flex gap-2">
            <Input
              type="month"
              className="w-40"
              value={period.slice(0, 7)}
              onChange={(e) => setPeriod(e.target.value + "-01")}
            />
            <PrimaryButton size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
              <Play className="mr-1.5 h-4 w-4" /> Згенерувати місяць
            </PrimaryButton>
          </div>
        }
      />

      <KpiGrid
        items={[
          { label: "Працівників", value: String(totals.count), tone: "neutral" },
          { label: "До сплати", value: fmt(totals.to_pay), tone: "primary" },
          { label: "Виплачено", value: fmt(totals.paid), tone: "success" },
          { label: "Залишок", value: fmt(totals.outstanding), tone: totals.outstanding > 0 ? "warning" : "neutral" },
        ]}
      />

      <div className="mt-4 mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі статуси</SelectItem>
            <SelectItem value="not_paid">Не виплачено</SelectItem>
            <SelectItem value="partial">Частково</SelectItem>
            <SelectItem value="paid">Виплачено</SelectItem>
            <SelectItem value="overpaid">Переплата</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Працівник</th>
                <th className="px-3 py-3 text-left">Посада</th>
                <th className="px-3 py-3 text-right">Ставка</th>
                <th className="px-3 py-3 text-right">Бонус</th>
                <th className="px-3 py-3 text-right">Утримання</th>
                <th className="px-3 py-3 text-right">До сплати</th>
                <th className="px-3 py-3 text-right">Виплачено</th>
                <th className="px-3 py-3 text-right">Залишок</th>
                <th className="px-3 py-3 text-left">Статус</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Завантаження…</td></tr>
              ) : (rows as any[]).length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    Розрахунки на цей місяць ще не створені. Натисніть «Згенерувати місяць».
                  </td>
                </tr>
              ) : (rows as any[]).map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td
                    className="px-3 py-3 font-medium cursor-pointer"
                    onClick={() => navigate({ to: "/staff/$id", params: { id: r.employee_id } })}
                  >
                    {r.employees?.full_name}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{r.employees?.position ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(r.base_salary_snapshot)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(r.bonus_amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(r.deduction_amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(r.amount_to_pay)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(r.amount_paid)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(r.amount_outstanding)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setAdjFor(r)}>Корекція</Button>
                      <Button size="sm" variant="outline" onClick={() => setPayFor(r)}>
                        <Wallet className="mr-1 h-3.5 w-3.5" /> Виплата
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Додати виплату — {payFor?.employees?.full_name}</DialogTitle>
          </DialogHeader>
          {payFor ? (
            <PaymentForm
              maxAmount={Number(payFor.amount_outstanding ?? 0)}
              sources={sources as any[]}
              onSubmit={(v) => addPay.mutate({ payroll_id: payFor.id, employee_id: payFor.employee_id, ...v })}
              pending={addPay.isPending}
            />
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjFor} onOpenChange={(o) => !o && setAdjFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Корекція — {adjFor?.employees?.full_name}</DialogTitle>
          </DialogHeader>
          {adjFor ? (
            <AdjustmentForm
              initial={adjFor}
              onSubmit={(v) => updAdj.mutate({ id: adjFor.id, ...v })}
              pending={updAdj.isPending}
            />
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PaymentForm({
  maxAmount,
  sources,
  onSubmit,
  pending,
}: {
  maxAmount: number;
  sources: any[];
  onSubmit: (v: any) => void;
  pending: boolean;
}) {
  const [v, setV] = useState({
    paid_at: new Date().toISOString().slice(0, 10),
    amount: Math.max(0, maxAmount),
    payment_type: "salary" as const,
    source_id: sources[0]?.id ?? null,
    payment_method: "bank_transfer" as const,
    reference: "",
    notes: "",
  });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Дата</Label>
          <Input type="date" value={v.paid_at} onChange={(e) => setV({ ...v, paid_at: e.target.value })} />
        </div>
        <div>
          <Label>Сума</Label>
          <Input type="number" step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Тип</Label>
          <Select value={v.payment_type} onValueChange={(x) => setV({ ...v, payment_type: x as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="advance">Аванс</SelectItem>
              <SelectItem value="salary">Зарплата</SelectItem>
              <SelectItem value="cash_part">Готівкова частина</SelectItem>
              <SelectItem value="bonus">Бонус</SelectItem>
              <SelectItem value="adjustment">Корекція</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Метод</Label>
          <Select value={v.payment_method} onValueChange={(x) => setV({ ...v, payment_method: x as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_transfer">Банківський переказ</SelectItem>
              <SelectItem value="card_transfer">На картку</SelectItem>
              <SelectItem value="cash">Готівка</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Джерело</Label>
        <Select value={v.source_id ?? ""} onValueChange={(x) => setV({ ...v, source_id: x || null })}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Референс</Label>
        <Input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
      </div>
      <div>
        <Label>Нотатка</Label>
        <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSubmit(v)} disabled={pending || v.amount <= 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Додати виплату
        </Button>
      </div>
    </div>
  );
}

function AdjustmentForm({ initial, onSubmit, pending }: any) {
  const [v, setV] = useState({
    bonus_amount: Number(initial.bonus_amount ?? 0),
    bonus_description: initial.bonus_description ?? "",
    deduction_amount: Number(initial.deduction_amount ?? 0),
    deduction_description: initial.deduction_description ?? "",
    notes: initial.notes ?? "",
  });
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Бонус</Label>
          <Input
            type="number"
            step="0.01"
            value={v.bonus_amount}
            onChange={(e) => setV({ ...v, bonus_amount: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Утримання</Label>
          <Input
            type="number"
            step="0.01"
            value={v.deduction_amount}
            onChange={(e) => setV({ ...v, deduction_amount: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label>Причина бонусу</Label>
        <Input value={v.bonus_description} onChange={(e) => setV({ ...v, bonus_description: e.target.value })} />
      </div>
      <div>
        <Label>Причина утримання</Label>
        <Input value={v.deduction_description} onChange={(e) => setV({ ...v, deduction_description: e.target.value })} />
      </div>
      <div>
        <Label>Нотатки</Label>
        <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSubmit(v)} disabled={pending}>Зберегти</Button>
      </div>
    </div>
  );
}
