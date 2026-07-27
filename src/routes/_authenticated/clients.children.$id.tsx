import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { PageContainer, SectionCard, PrimaryButton, SecondaryButton, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getChild, saveChild, completeChildAttendance, archiveChild, restoreChild } from "@/lib/clients.functions";
import { listLookups } from "@/lib/lookups.functions";
import { childStatusLabel, contractStatusLabel } from "@/lib/child-validation";
import { EmptySelectHint } from "@/components/settings/empty-select-hint";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/children/$id")({
  component: ChildCard,
  head: () => ({ meta: [
    { title: "Картка дитини — Bright OS" },
    { name: "description", content: "Редагування даних дитини, група, дати відвідування." },
  ] }),
});

function ChildCard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getChild);
  const saveFn = useServerFn(saveChild);
  const completeFn = useServerFn(completeChildAttendance);
  const archiveFn = useServerFn(archiveChild);
  const restoreFn = useServerFn(restoreChild);
  const lookupsFn = useServerFn(listLookups);

  const { data, isLoading } = useQuery({ queryKey: ["child", id], queryFn: () => getFn({ data: { id } }) });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  const [form, setForm] = useState<any>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

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
    mutationFn: () => completeFn({ data: { id, end_date: endDate, reason: reason.trim() || null } }),
    onSuccess: (res: any) => {
      toast.success(`Відвідування завершено${res?.charges_cancelled ? ` · скасовано ${res.charges_cancelled} нарахувань` : ""}`);
      setCompleteOpen(false); setReason("");
      invalidate();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { id, reason: archiveReason.trim() || null } }),
    onSuccess: () => { toast.success("Переміщено в архів"); setArchiveOpen(false); setArchiveReason(""); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const restoreMut = useMutation({
    mutationFn: () => restoreFn({ data: { id } }),
    onSuccess: () => { toast.success("Відновлено"); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const current = useMemo(() => (form ?? data?.child) as any, [form, data]);
  const activeContract = useMemo(() => {
    if (!data) return null;
    return (data.contracts as any[]).find((c) => c.status !== "cancelled" && c.status !== "draft") ?? (data.contracts as any[])[0] ?? null;
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

  const update = (patch: any) => setForm({ ...(form ?? child), ...patch });

  const submit = () => {
    if (!form) return;
    save.mutate({
      id,
      client_id: child.client_id,
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
          </div>
          <p className="text-sm text-muted-foreground">
            Батьки: <Link to="/clients/$id" params={{ id: child.client_id }} className="text-primary hover:underline">{parentName}</Link>
            {child.clients?.phone ? ` · ${child.clients.phone}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isArchived && !isGraduated ? (
            <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
              <AlertDialogTrigger asChild>
                <PrimaryButton><CheckCircle2 className="mr-2 h-4 w-4" />Завершити відвідування</PrimaryButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Завершити відвідування дитини?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Дитина отримає статус "Випущена" з обраною датою завершення. Майбутні неоплачені нарахування будуть скасовані. Оплачена історія залишається без змін.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Дата завершення</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Причина (необов'язково)</Label>
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Напр.: перехід у школу, переїзд" />
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
          ) : null}
          {isArchived ? (
            <Button variant="ghost" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}>Відновити</Button>
          ) : (
            <AlertDialog open={archiveOpen} onOpenChange={(o) => { setArchiveOpen(o); if (!o) setArchiveReason(""); }}>
              <AlertDialogTrigger asChild>
                <Button variant="ghost">В архів</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>В архів?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Використовується для помилкових/тестових записів. Дитина зникне з активних списків, історія збережеться.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea rows={2} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Причина (необов'язково)" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveMut.mutate()}>Перемістити в архів</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Основне" className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ім'я *"><Input value={current.first_name ?? ""} onChange={(e) => update({ first_name: e.target.value })} /></Field>
            <Field label="Прізвище"><Input value={current.last_name ?? ""} onChange={(e) => update({ last_name: e.target.value })} /></Field>
            <Field label="Дата народження"><Input type="date" value={current.birth_date ?? ""} onChange={(e) => update({ birth_date: e.target.value })} /></Field>
            <Field label="Група">
              <Select value={current.group_id ?? ""} onValueChange={(v) => update({ group_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {optionsForChild.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeGroups.length === 0 ? <EmptySelectHint to="/admin/groups" label="Створити першу групу" /> : null}
            </Field>
            <Field label="Початок відвідування"><Input type="date" value={current.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value })} /></Field>
            <Field label="Завершення відвідування"><Input type="date" value={current.end_date ?? ""} onChange={(e) => update({ end_date: e.target.value })} /></Field>
          </div>
          {form ? (
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Скасувати</Button>
              <PrimaryButton onClick={submit} disabled={save.isPending}>Зберегти</PrimaryButton>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Договір і фінанси">
          {activeContract ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Договір</span>
                <Link to="/clients/$id" params={{ id: child.client_id }} className="text-primary hover:underline">№ {activeContract.number}</Link>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Статус</span>
                <span>{contractStatusLabel(activeContract.status)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Абонплата</span>
                <span>{Number(activeContract.monthly_price ?? 0).toFixed(0)} ₴</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Період</span>
                <span>{activeContract.start_date ?? "—"} → {activeContract.end_date ?? "…"}</span></div>
              <div className="mt-3 border-t pt-2 flex justify-between">
                <span className="text-muted-foreground">Поточний борг</span>
                <span className={debt > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>{debt > 0 ? `${debt.toFixed(0)} ₴` : "—"}</span>
              </div>
              <Link to="/clients/$id" params={{ id: child.client_id }} className="mt-2 inline-block text-xs text-primary hover:underline">Відкрити фінанси клієнта →</Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Активного договору немає.</p>
          )}
        </SectionCard>
      </div>
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
