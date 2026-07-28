import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Pencil, RotateCcw, AlertTriangle } from "lucide-react";
import { PageContainer, SectionCard, PrimaryButton, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  getChild, saveChild, completeChildAttendance, reopenChildAttendance,
} from "@/lib/clients.functions";
import { listLookups } from "@/lib/lookups.functions";
import { childStatusLabel, contractStatusLabel } from "@/lib/child-validation";
import { EmptySelectHint } from "@/components/settings/empty-select-hint";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/children/$id")({
  component: ChildCard,
  head: () => ({ meta: [
    { title: "Картка дитини — Bright OS" },
    { name: "description", content: "Дані дитини, група, дати відвідування, договір і хронологія." },
  ] }),
});

type ReasonCode = "completed" | "moved" | "withdrew" | "other";
const REASON_OPTIONS: Array<{ code: ReasonCode; label: string; hint: string }> = [
  { code: "completed", label: "Випуск (завершення програми)", hint: "Дитина отримує статус «Випущена», договір закривається." },
  { code: "moved", label: "Переїзд", hint: "Дитина переходить в архів, договір скасовується." },
  { code: "withdrew", label: "Відмова батьків", hint: "Дитина переходить в архів, договір скасовується." },
  { code: "other", label: "Інше", hint: "Дитина переходить в архів, договір скасовується. Опишіть причину нижче." },
];

function ChildCard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getChild);
  const saveFn = useServerFn(saveChild);
  const completeFn = useServerFn(completeChildAttendance);
  const reopenFn = useServerFn(reopenChildAttendance);
  const lookupsFn = useServerFn(listLookups);

  const { data, isLoading } = useQuery({ queryKey: ["child", id], queryFn: () => getFn({ data: { id } }) });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  const [form, setForm] = useState<any>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reasonCode, setReasonCode] = useState<ReasonCode>("completed");
  const [note, setNote] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["child", id] });
    qc.invalidateQueries({ queryKey: ["children-by-group"] });
    if (data?.child.client_id) qc.invalidateQueries({ queryKey: ["client", data.child.client_id] });
  };

  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => { toast.success("Збережено"); setForm(null); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const complete = useMutation({
    mutationFn: () => completeFn({ data: { id, end_date: endDate, reason_code: reasonCode, note: note.trim() || null } }),
    onSuccess: (res: any) => {
      toast.success(`Відвідування завершено${res?.charges_cancelled ? ` · скасовано ${res.charges_cancelled} нарахувань` : ""}`);
      setCompleteOpen(false); setNote(""); setReasonCode("completed");
      invalidate();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const reopen = useMutation({
    mutationFn: () => reopenFn({ data: { id, note: reopenNote.trim() || null } }),
    onSuccess: () => {
      toast.success("Відвідування відновлено. Перевірте білінг.");
      setReopenOpen(false); setReopenNote("");
      invalidate();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const current = useMemo(() => (form ?? data?.child) as any, [form, data]);
  const activeContract = useMemo(() => {
    if (!data) return null;
    const arr = data.contracts as any[];
    return arr.find((c) => c.status !== "cancelled" && c.status !== "completed" && c.status !== "draft") ?? arr[0] ?? null;
  }, [data]);
  const debt = useMemo(() => {
    if (!data) return 0;
    return (data.charges as any[])
      .filter((c) => c.status !== "cancelled")
      .reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.paid_amount ?? 0)), 0);
  }, [data]);

  if (isLoading || !data) return <PageContainer><p className="text-muted-foreground">Завантаження...</p></PageContainer>;

  const child = data.child as any;
  const branchId = child.branch_id as string;
  const parentName = `${child.clients?.parent_first_name ?? ""} ${child.clients?.parent_last_name ?? ""}`.trim() || "—";
  const activeGroups = (lookups?.groups ?? []).filter((g: any) => g.branch_id === branchId);
  const currentGroup = child.group;
  const optionsForChild = currentGroup && !activeGroups.some((g: any) => g.id === currentGroup.id)
    ? [...activeGroups, { id: currentGroup.id, name: `${currentGroup.name}${currentGroup.is_active === false ? " (архів)" : ""}` }]
    : activeGroups;
  const isArchived = current.status === "archived";
  const isGraduated = current.status === "graduated";
  const canReopen = isArchived || isGraduated;

  const age = computeAge(current.birth_date);
  const timeline = (data as any).timeline ?? [];

  const update = (patch: any) => setForm({ ...(form ?? child), ...patch });

  const submit = () => {
    if (!form) return;
    save.mutate({
      id,
      client_id: child.client_id,
      // branch_id is re-derived server-side; sending current value for schema shape only.
      branch_id: branchId,
      first_name: form.first_name,
      last_name: form.last_name,
      birth_date: form.birth_date,
      group_id: form.group_id ?? null,
      start_date: form.start_date ?? null,
      end_date: form.end_date ?? null,
    });
  };

  return (
    <PageContainer>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/clients/children" })}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Дитина</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {child.first_name} {child.last_name ?? ""}
            </h1>
            <StatusBadge tone={toneForChildStatus(current.status)}>{childStatusLabel(current.status)}</StatusBadge>
            {age ? <span className="text-sm text-muted-foreground">· {age}</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Батьки: <Link to="/clients/$id" params={{ id: child.client_id }} search={{ tab: "main" }} className="text-primary hover:underline">{parentName}</Link>
            {child.clients?.phone ? ` · ${child.clients.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!canReopen ? (
            <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
              <AlertDialogTrigger asChild>
                <PrimaryButton><CheckCircle2 className="mr-2 h-4 w-4" />Завершити відвідування</PrimaryButton>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>Завершити відвідування?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Оберіть причину — від неї залежить фінальний статус дитини і договору. Майбутні повністю неоплачені нарахування будуть скасовані. Оплачені й частково оплачені періоди залишаються без змін.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Причина *</Label>
                    <RadioGroup value={reasonCode} onValueChange={(v) => setReasonCode(v as ReasonCode)} className="gap-2">
                      {REASON_OPTIONS.map((o) => (
                        <label key={o.code} className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/40">
                          <RadioGroupItem value={o.code} className="mt-0.5" />
                          <span className="text-sm">
                            <span className="font-medium">{o.label}</span>
                            <span className="block text-xs text-muted-foreground">{o.hint}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Дата завершення *</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Нотатка (необов'язково)</Label>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Деталі для історії" maxLength={1000} />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={() => complete.mutate()} disabled={complete.isPending}>
                    {complete.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Завершити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
              <AlertDialogTrigger asChild>
                <PrimaryButton><RotateCcw className="mr-2 h-4 w-4" />Відновити відвідування</PrimaryButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Відновити відвідування?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Доступно лише для адміністратора/менеджера. Дитина отримає статус «Активна», дата завершення буде очищена, договір буде повторно відкрито.
                    <br /><br />
                    <span className="font-medium text-amber-700">Скасовані раніше нарахування НЕ будуть автоматично відновлені.</span> Після відновлення перевірте білінг у розділі Розрахунки і, за потреби, згенеруйте нарахування наново вручну.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div>
                  <Label className="text-xs">Причина корекції (для аудиту)</Label>
                  <Textarea rows={2} value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} placeholder="Напр.: помилково закрито" maxLength={1000} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reopen.mutate()} disabled={reopen.isPending}>
                    {reopen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Відновити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!form ? (
            <Button variant="outline" onClick={() => setForm({ ...child })}>
              <Pencil className="mr-2 h-4 w-4" />Редагувати
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Основне" className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ім'я *"><Input value={current.first_name ?? ""} readOnly={!form} disabled={!form} onChange={(e) => update({ first_name: e.target.value })} /></Field>
            <Field label="Прізвище"><Input value={current.last_name ?? ""} readOnly={!form} disabled={!form} onChange={(e) => update({ last_name: e.target.value })} /></Field>
            <Field label={age ? `Дата народження (${age})` : "Дата народження"}>
              <Input type="date" value={current.birth_date ?? ""} readOnly={!form} disabled={!form} onChange={(e) => update({ birth_date: e.target.value })} />
            </Field>
            <Field label="Група">
              {form ? (
                <>
                  <Select value={current.group_id ?? ""} onValueChange={(v) => update({ group_id: v || null })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {optionsForChild.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {activeGroups.length === 0 ? <EmptySelectHint to="/admin/groups" label="Створити першу групу" /> : null}
                </>
              ) : (
                <Input value={currentGroup?.name ?? "—"} readOnly disabled />
              )}
            </Field>
            <Field label="Початок відвідування"><Input type="date" value={current.start_date ?? ""} readOnly={!form} disabled={!form} onChange={(e) => update({ start_date: e.target.value })} /></Field>
            <Field label="Завершення відвідування"><Input type="date" value={current.end_date ?? ""} readOnly disabled /></Field>
          </div>
          {form ? (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Скасувати</Button>
              <PrimaryButton onClick={submit} disabled={save.isPending}>Зберегти</PrimaryButton>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Статус і дата завершення керуються діями «Завершити відвідування» / «Відновити відвідування» — вони синхронізують дитину, договір і нарахування.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Договір">
          {activeContract ? (
            <div className="space-y-2 text-sm">
              <Row k="Договір">
                <Link to="/clients/$id" params={{ id: child.client_id }} search={{ tab: "contract" }} className="text-primary hover:underline">№ {activeContract.number}</Link>
              </Row>
              <Row k="Статус">{contractStatusLabel(activeContract.status)}</Row>
              <Row k="Послуга">{activeContract.service?.name ?? "—"}</Row>
              <Row k="Тариф">{activeContract.plan?.name ?? "—"}</Row>
              <Row k="Період">{activeContract.start_date ?? "—"} → {activeContract.end_date ?? "…"}</Row>
              <div className="mt-2 flex flex-col gap-1 text-xs">
                <Link to="/clients/$id" params={{ id: child.client_id }} search={{ tab: "contract" }} className="text-primary hover:underline">Відкрити договір →</Link>
                <Link to="/clients/$id" params={{ id: child.client_id }} search={{ tab: "finance" }} className="text-primary hover:underline">Фінанси клієнта →</Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Активного договору немає.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Хронологія" className="mt-4">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Подій ще немає.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {timeline.slice(0, 30).map((e: any) => (
              <li key={e.id} className="flex gap-3 border-b border-border/40 pb-2 last:border-0">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{format(new Date(e.created_at), "dd.MM.yy HH:mm")}</span>
                <span className="flex-1">
                  <span className="font-medium">{timelineKindLabel(e.payload?.kind ?? e.type)}</span>
                  {renderTimelineExtra(e)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {timeline.some((e: any) => e.payload?.billing_review_required) ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            <p className="font-medium">Потрібна перевірка білінгу</p>
            <p className="text-xs">Відвідування було відновлено, але скасовані нарахування не були автоматично відтворені. Перегляньте <Link to="/clients/$id" params={{ id: child.client_id }} search={{ tab: "finance" }} className="underline">фінанси клієнта</Link> та згенеруйте нарахування за потреби.</p>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}

function toneForChildStatus(status: string): any {
  switch (status) {
    case "active": return "success";
    case "paused": return "warning";
    case "graduated": return "info";
    case "archived": return "neutral";
    default: return "neutral";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right">{children}</span></div>;
}

function computeAge(birth?: string | null): string | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0) return `${Math.max(0, years * 12 + months)} міс`;
  return months === 0 ? `${years} р` : `${years} р ${months} міс`;
}

const KIND_LABELS: Record<string, string> = {
  child_created: "Дитину створено",
  child_group_changed: "Змінено групу",
  child_status_changed: "Змінено статус",
  child_archived: "Переміщено в архів",
  child_restored: "Відновлено з архіву",
  child_completed: "Завершення відвідування",
  child_reopened: "Відновлення відвідування (корекція)",
  contract_generated: "Договір створено",
  charges_generated: "Згенеровано нарахування",
  pdf_generated: "PDF договору",
  payment_posted: "Прийнято платіж",
  payment_reallocated: "Перерозподіл платежу",
  payment_voided: "Скасовано платіж",
  credit_applied: "Використано кредит клієнта",
  status_changed: "Зміна статусу",
  note_added: "Примітка",
};

function timelineKindLabel(k: string): string {
  return KIND_LABELS[k] ?? k;
}

function renderTimelineExtra(e: any) {
  const p = e.payload ?? {};
  const bits: string[] = [];
  if (p.kind === "child_completed") {
    const reason = p.reason_code ? REASON_OPTIONS.find((o) => o.code === p.reason_code)?.label : null;
    if (reason) bits.push(reason);
    if (p.end_date) bits.push(`до ${p.end_date}`);
    if (typeof p.charges_cancelled === "number") bits.push(`скасовано нарахувань: ${p.charges_cancelled}`);
    if (p.note) bits.push(`«${p.note}»`);
  } else if (p.kind === "child_reopened") {
    if (p.note) bits.push(`«${p.note}»`);
    if (p.billing_review_required) bits.push("білінг: потрібна перевірка");
  } else if (p.kind === "child_group_changed") {
    bits.push(`${p.from_group_name ?? "—"} → ${p.to_group_name ?? "—"}`);
  } else if (p.kind === "child_archived" || p.kind === "child_restored" || p.kind === "child_status_changed") {
    if (p.from || p.to) bits.push(`${p.from ?? "—"} → ${p.to ?? "—"}`);
    if (p.reason) bits.push(`«${p.reason}»`);
  }
  if (bits.length === 0) return null;
  return <span className="ml-2 text-xs text-muted-foreground">· {bits.join(" · ")}</span>;
}
