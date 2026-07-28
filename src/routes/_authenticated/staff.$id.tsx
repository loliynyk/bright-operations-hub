import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Save, X, Eye, EyeOff, Copy, Archive, RotateCcw, Plus } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getEmployee,
  upsertEmployee,
  archiveEmployee,
  addEmployeeSalary,
  revealEmployeeCard,
} from "@/lib/employees.functions";

export const Route = createFileRoute("/_authenticated/staff/$id")({
  component: EmployeeProfilePage,
  head: () => ({ meta: [{ title: "Працівник — Bright OS" }] }),
});

const CURRENCY = "UAH";
const fmtMoney = (n?: number | string | null) => {
  const v = Number(n ?? 0);
  return v.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₴";
};
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("uk-UA") : "—");
const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("uk-UA", { year: "numeric", month: "long" });

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  not_paid: "Не виплачено",
  partial: "Частково",
  paid: "Виплачено",
  overpaid: "Переплата",
};
const PAYROLL_STATUS_TONE: Record<string, any> = {
  not_paid: "warning",
  partial: "info",
  paid: "success",
  overpaid: "danger",
};

function EmployeeProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getEmployee);
  const saveFn = useServerFn(upsertEmployee);
  const arcFn = useServerFn(archiveEmployee);
  const addSalaryFn = useServerFn(addEmployeeSalary);
  const revealFn = useServerFn(revealEmployeeCard);

  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [addingSalary, setAddingSalary] = useState(false);
  const [rawCard, setRawCard] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Збережено");
      setEdit(false);
      setForm(null);
      qc.invalidateQueries({ queryKey: ["employee", id] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const arc = useMutation({
    mutationFn: (archive: boolean) => arcFn({ data: { id, archive } }),
    onSuccess: () => {
      toast.success("Оновлено");
      qc.invalidateQueries({ queryKey: ["employee", id] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const addSal = useMutation({
    mutationFn: (v: any) => addSalaryFn({ data: v }),
    onSuccess: () => {
      toast.success("Ставку додано");
      setAddingSalary(false);
      qc.invalidateQueries({ queryKey: ["employee", id] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  if (isLoading || !data) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Завантаження…</p>
      </PageContainer>
    );
  }

  const e = data.employee;
  const isArchived = e.status === "archived";
  const startEdit = () => {
    setForm({ ...e });
    setEdit(true);
  };
  const submitEdit = () => {
    save.mutate({
      id: e.id,
      branch_id: e.branch_id,
      full_name:
        [form.first_name, form.last_name].filter(Boolean).join(" ").trim() ||
        form.full_name ||
        e.full_name,
      ...form,
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title={e.full_name}
        description={e.position ?? "Працівник"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/staff" })}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> До списку
            </Button>
            {!edit ? (
              <>
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Pencil className="mr-1.5 h-4 w-4" /> Редагувати
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => arc.mutate(!isArchived)}
                >
                  {isArchived ? (
                    <>
                      <RotateCcw className="mr-1.5 h-4 w-4" /> Відновити
                    </>
                  ) : (
                    <>
                      <Archive className="mr-1.5 h-4 w-4" /> Архівувати
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => { setEdit(false); setForm(null); }}>
                  <X className="mr-1.5 h-4 w-4" /> Скасувати
                </Button>
                <PrimaryButton size="sm" onClick={submitEdit} disabled={save.isPending}>
                  <Save className="mr-1.5 h-4 w-4" /> Зберегти
                </PrimaryButton>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <StatusBadge tone={isArchived ? "neutral" : e.status === "paused" ? "warning" : "success"}>
          {isArchived ? "Архів" : e.status === "paused" ? "Пауза" : "Активний"}
        </StatusBadge>
        {data.currentSalary ? (
          <span className="text-sm text-muted-foreground">
            Поточна ставка: <b className="text-foreground">{fmtMoney(data.currentSalary.base_salary)}</b>
          </span>
        ) : (
          <span className="text-sm text-warning">Ставка не встановлена</span>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Основне</TabsTrigger>
          <TabsTrigger value="salary">Ставка</TabsTrigger>
          <TabsTrigger value="payroll">Зарплата</TabsTrigger>
          <TabsTrigger value="bank">Реквізити</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <SectionCard title="Особиста інформація">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Табельний №" edit={edit} value={form?.employee_number} display={e.employee_number}
                onChange={(v) => setForm({ ...form, employee_number: v })} />
              <Field label="Посада" edit={edit} value={form?.position} display={e.position}
                onChange={(v) => setForm({ ...form, position: v })} />
              <Field label="Імʼя" edit={edit} value={form?.first_name} display={e.first_name}
                onChange={(v) => setForm({ ...form, first_name: v })} />
              <Field label="Прізвище" edit={edit} value={form?.last_name} display={e.last_name}
                onChange={(v) => setForm({ ...form, last_name: v })} />
              <Field label="Телефон" edit={edit} value={form?.phone} display={e.phone}
                onChange={(v) => setForm({ ...form, phone: v })} />
              <Field label="Email" edit={edit} value={form?.email} display={e.email}
                onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Адреса" edit={edit} value={form?.address} display={e.address}
                onChange={(v) => setForm({ ...form, address: v })} className="md:col-span-2" />
              <Field label="Дата народження" edit={edit} type="date" value={form?.birth_date} display={fmtDate(e.birth_date)}
                onChange={(v) => setForm({ ...form, birth_date: v })} />
              <div>
                <Label>Тип зайнятості</Label>
                {edit ? (
                  <Select value={form?.employment_type ?? ""} onValueChange={(v) => setForm({ ...form, employment_type: v || null })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Повна</SelectItem>
                      <SelectItem value="part_time">Часткова</SelectItem>
                      <SelectItem value="contract">Контракт</SelectItem>
                      <SelectItem value="intern">Стажер</SelectItem>
                      <SelectItem value="other">Інше</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1 text-sm">{e.employment_type ?? "—"}</p>
                )}
              </div>
              <Field label="Дата прийому" edit={edit} type="date" value={form?.hire_date} display={fmtDate(e.hire_date)}
                onChange={(v) => setForm({ ...form, hire_date: v })} />
              <Field label="Дата звільнення" edit={edit} type="date" value={form?.termination_date} display={fmtDate(e.termination_date)}
                onChange={(v) => setForm({ ...form, termination_date: v })} />
            </div>
          </SectionCard>

          <SectionCard title="Контактна особа на випадок надзвичайної ситуації">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="ПІБ" edit={edit} value={form?.emergency_contact_name} display={e.emergency_contact_name}
                onChange={(v) => setForm({ ...form, emergency_contact_name: v })} />
              <Field label="Телефон" edit={edit} value={form?.emergency_contact_phone} display={e.emergency_contact_phone}
                onChange={(v) => setForm({ ...form, emergency_contact_phone: v })} />
              <Field label="Ким доводиться" edit={edit} value={form?.emergency_contact_relationship} display={e.emergency_contact_relationship}
                onChange={(v) => setForm({ ...form, emergency_contact_relationship: v })} />
            </div>
          </SectionCard>

          <SectionCard title="Нотатки">
            {edit ? (
              <Textarea value={form?.notes ?? ""} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} rows={4} />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{e.notes ?? "—"}</p>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="salary" className="mt-4">
          <SectionCard
            title="Історія ставки"
            description="Кожна зміна фіксується як окрема версія. Активна ставка визначається за датою."
          >
            <div className="mb-3 flex justify-end">
              <PrimaryButton size="sm" onClick={() => setAddingSalary(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Додати зміну
              </PrimaryButton>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">З дати</th>
                  <th className="py-2 text-left">До дати</th>
                  <th className="py-2 text-right">Сума</th>
                  <th className="py-2 text-left">Коментар</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.salaries.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Ще немає ставок</td></tr>
                ) : data.salaries.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-2">{fmtDate(s.effective_from)}</td>
                    <td className="py-2">{fmtDate(s.effective_to)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(s.base_salary)}</td>
                    <td className="py-2 text-muted-foreground">{s.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          <SectionCard title="Місячні розрахунки">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Місяць</th>
                  <th className="py-2 text-right">До сплати</th>
                  <th className="py-2 text-right">Виплачено</th>
                  <th className="py-2 text-right">Залишок</th>
                  <th className="py-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.payrolls.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Ще немає розрахунків</td></tr>
                ) : data.payrolls.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2 capitalize">{monthLabel(p.period_month)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount_to_pay)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount_paid)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount_outstanding)}</td>
                    <td className="py-2">
                      <StatusBadge tone={PAYROLL_STATUS_TONE[p.status]}>
                        {PAYROLL_STATUS_LABEL[p.status] ?? p.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Виплати" className="mt-4">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Дата</th>
                  <th className="py-2 text-right">Сума</th>
                  <th className="py-2 text-left">Тип</th>
                  <th className="py-2 text-left">Джерело</th>
                  <th className="py-2 text-left">Метод</th>
                  <th className="py-2 text-left">Референс</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.payments.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Ще немає виплат</td></tr>
                ) : data.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2">{fmtDate(p.paid_at)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                    <td className="py-2 text-muted-foreground">{p.payment_type}</td>
                    <td className="py-2 text-muted-foreground">{p.payroll_payment_sources?.name ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{p.payment_method}</td>
                    <td className="py-2 text-muted-foreground">{p.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        </TabsContent>

        <TabsContent value="bank" className="mt-4">
          <SectionCard title="Реквізити для виплат">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Банк" edit={edit} value={form?.bank_name} display={e.bank_name}
                onChange={(v) => setForm({ ...form, bank_name: v })} />
              <div>
                <Label>Номер картки</Label>
                {edit ? (
                  <Input
                    value={form?.card_number ?? ""}
                    onChange={(ev) => setForm({ ...form, card_number: ev.target.value })}
                    placeholder="1234 5678 9012 3456"
                  />
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-sm">
                      {rawCard ?? e.card_number_masked ?? "—"}
                    </code>
                    {e.card_number_masked ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (rawCard) return setRawCard(null);
                            try {
                              const r = await revealFn({ data: { id } });
                              setRawCard(r.card_number);
                            } catch (err: any) {
                              toast.error("Немає доступу", { description: err.message });
                            }
                          }}
                        >
                          {rawCard ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        {rawCard ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(rawCard);
                              toast.success("Скопійовано");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog open={addingSalary} onOpenChange={(o) => !o && setAddingSalary(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нова ставка</DialogTitle>
          </DialogHeader>
          <SalaryForm onSubmit={(v) => addSal.mutate({ employee_id: id, currency: CURRENCY, ...v })} pending={addSal.isPending} />
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({
  label,
  edit,
  value,
  display,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  edit: boolean;
  value: any;
  display: any;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {edit ? (
        <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="mt-1 text-sm">{display || "—"}</p>
      )}
    </div>
  );
}

function SalaryForm({ onSubmit, pending }: { onSubmit: (v: any) => void; pending: boolean }) {
  const [v, setV] = useState({
    base_salary: 0,
    effective_from: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  return (
    <div className="grid gap-3">
      <div>
        <Label>Сума</Label>
        <Input
          type="number"
          value={v.base_salary}
          onChange={(e) => setV({ ...v, base_salary: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label>З дати</Label>
        <Input
          type="date"
          value={v.effective_from}
          onChange={(e) => setV({ ...v, effective_from: e.target.value })}
        />
      </div>
      <div>
        <Label>Коментар</Label>
        <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onSubmit(v)} disabled={pending || v.base_salary < 0}>
          Зберегти
        </Button>
      </div>
    </div>
  );
}
