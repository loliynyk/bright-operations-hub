import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Download, CheckCircle2, Circle, AlertCircle, RefreshCw } from "lucide-react";
import { PageContainer, SectionCard, PrimaryButton, SecondaryButton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getClient, updateClient, saveChild } from "@/lib/clients.functions";
import { listLookups } from "@/lib/lookups.functions";
import {
  updateContract, confirmContract, generateContractPdf,
  generateInitialCharges, getContractPdfUrl,
} from "@/lib/admissions.functions";
import { Timeline } from "@/components/timeline";
import { FinanceTab } from "@/components/finance-tab";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getClient);
  const lookupsFn = useServerFn(listLookups);
  const updateFn = useServerFn(updateClient);

  const { data, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => getFn({ data: { id } }) });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  const [form, setForm] = useState<any>(null);
  const save = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id, ...patch } as any }),
    onSuccess: () => { toast.success("Збережено"); qc.invalidateQueries({ queryKey: ["client", id] }); setForm(null); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  if (isLoading || !data) return <PageContainer><p className="text-muted-foreground">Завантаження...</p></PageContainer>;
  const client = data.client;
  const current = form ?? client;
  const update = (patch: any) => setForm({ ...(form ?? client), ...patch });

  return (
    <PageContainer>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/clients" })}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Клієнт</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.parent_first_name} {client.parent_last_name}
          </h1>
        </div>
      </div>

      <Tabs defaultValue="main">
        <TabsList>
          <TabsTrigger value="main">Основне</TabsTrigger>
          <TabsTrigger value="children">Діти ({data.children.length})</TabsTrigger>
          <TabsTrigger value="finance">Фінанси</TabsTrigger>
          <TabsTrigger value="contract">Договір ({data.contracts.length})</TabsTrigger>
          <TabsTrigger value="history">Історія</TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-6 space-y-4">
          <SectionCard title="Контактні дані">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ім'я"><Input value={current.parent_first_name ?? ""} onChange={(e) => update({ parent_first_name: e.target.value })} /></Field>
              <Field label="Прізвище"><Input value={current.parent_last_name ?? ""} onChange={(e) => update({ parent_last_name: e.target.value })} /></Field>
              <Field label="Телефон"><Input value={current.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={current.email ?? ""} onChange={(e) => update({ email: e.target.value })} /></Field>
              <Field label="Адреса" wide><Input value={current.address ?? ""} onChange={(e) => update({ address: e.target.value })} /></Field>
              <Field label="Нотатки" wide><Textarea rows={3} value={current.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} /></Field>
            </div>
          </SectionCard>
          {form ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Скасувати</Button>
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>Зберегти</Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="children" className="mt-6 space-y-4">
          <ChildrenTab clientId={id} branchId={client.branch_id} children={data.children} lookups={lookups} />
        </TabsContent>

        <TabsContent value="finance" className="mt-6">
          <FinanceTab clientId={id} branchId={client.branch_id} />
        </TabsContent>

        <TabsContent value="contract" className="mt-6 space-y-4">
          {data.contracts.length === 0 ? (
            <SectionCard><p className="text-sm text-muted-foreground">Договорів ще немає.</p></SectionCard>
          ) : (
            data.contracts.map((c: any) => (
              <ContractCard key={c.id} contract={c} lookups={lookups} attachments={data.attachments} branchId={client.branch_id} chargesCount={(data.chargeCountByContract ?? {})[c.id] ?? 0} />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <SectionCard title="Історія клієнта">
            <Timeline events={data.timeline as any} />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function ChildrenTab({ clientId, branchId, children, lookups }: any) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveChild);
  const mutation = useMutation({
    mutationFn: (data: any) => saveFn({ data }),
    onSuccess: () => { toast.success("Збережено"); qc.invalidateQueries({ queryKey: ["client", clientId] }); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const [adding, setAdding] = useState(false);
  const [newChild, setNewChild] = useState({ first_name: "", last_name: "", birth_date: "" });

  return (
    <div className="space-y-4">
      {children.map((child: any) => (
        <SectionCard key={child.id}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{child.first_name} {child.last_name}</p>
              <p className="text-sm text-muted-foreground">Народжений(а): {child.birth_date ?? "—"} · Статус: {child.status}</p>
            </div>
            <div className="w-56">
              <Label className="text-xs">Група</Label>
              <Select value={child.group_id ?? ""} onValueChange={(v) => mutation.mutate({ id: child.id, client_id: clientId, branch_id: branchId, first_name: child.first_name, group_id: v || null } as any)}>
                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(lookups?.groups ?? []).filter((g: any) => g.branch_id === branchId).map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      ))}
      {adding ? (
        <SectionCard title="Нова дитина">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Ім'я"><Input value={newChild.first_name} onChange={(e) => setNewChild({ ...newChild, first_name: e.target.value })} /></Field>
            <Field label="Прізвище"><Input value={newChild.last_name} onChange={(e) => setNewChild({ ...newChild, last_name: e.target.value })} /></Field>
            <Field label="Дата народження"><Input type="date" value={newChild.birth_date} onChange={(e) => setNewChild({ ...newChild, birth_date: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Скасувати</Button>
            <Button onClick={() => {
              mutation.mutate({ client_id: clientId, branch_id: branchId, first_name: newChild.first_name, last_name: newChild.last_name || null, birth_date: newChild.birth_date || null } as any);
              setAdding(false); setNewChild({ first_name: "", last_name: "", birth_date: "" });
            }} disabled={!newChild.first_name}>Додати</Button>
          </div>
        </SectionCard>
      ) : (
        <SecondaryButton onClick={() => setAdding(true)}>Додати дитину</SecondaryButton>
      )}
    </div>
  );
}

function ContractCard({ contract, lookups, attachments, branchId }: any) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateContract);
  const confirmFn = useServerFn(confirmContract);
  const pdfFn = useServerFn(generateContractPdf);
  const chargesFn = useServerFn(generateInitialCharges);
  const urlFn = useServerFn(getContractPdfUrl);

  const [patch, setPatch] = useState<any>({});
  const merged = { ...contract, ...patch };
  const attachment = attachments.find((a: any) => a.contract_id === contract.id);
  const isDraft = contract.status === "draft";
  const isConfirmed = contract.status === "confirmed" || contract.status === "generated" || contract.status === "sent" || contract.status === "signed" || contract.status === "completed";
  const hasPdf = !!contract.pdf_path;

  const save = useMutation({
    mutationFn: () => updateFn({ data: {
      id: contract.id, ...patch,
      monthly_price: patch.monthly_price !== undefined ? Number(patch.monthly_price) : undefined,
      manual_discount: patch.manual_discount !== undefined ? Number(patch.manual_discount) : undefined,
    } as any }),
    onSuccess: () => { toast.success("Збережено"); qc.invalidateQueries({ queryKey: ["client", contract.client_id] }); setPatch({}); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const confirmMut = useMutation({
    mutationFn: () => {
      const branch = merged.branch_id ?? branchId;
      if (!branch) throw new Error("Не вказано філію");
      if (!merged.service_id) throw new Error("Оберіть послугу");
      if (!merged.plan_id) throw new Error("Оберіть тарифний план");
      if (!merged.price_version_id) throw new Error("Оберіть версію цін");
      if (!merged.start_date) throw new Error("Оберіть дату початку");
      const price = Number(merged.monthly_price);
      if (!Number.isFinite(price) || price <= 0) throw new Error("Місячна ціна має бути більше 0");
      return confirmFn({ data: {
        id: contract.id,
        branch_id: branch,
        service_id: merged.service_id,
        plan_id: merged.plan_id,
        price_version_id: merged.price_version_id,
        discount_id: merged.discount_id ?? null,
        manual_discount: Number(merged.manual_discount ?? 0),
        monthly_price: price,
        start_date: merged.start_date,
        end_date: merged.end_date ?? null,
        comment: merged.comment ?? null,
      } as any });
    },
    onSuccess: async () => {
      toast.success("Договір підтверджено");
      setPatch({});
      try {
        await chargesFn({ data: { contractId: contract.id } });
      } catch (e: any) {
        toast.error("Не вдалося створити нарахування", { description: e.message });
      }
      try {
        await pdfFn({ data: { contractId: contract.id } });
      } catch (e: any) {
        toast.error("Не вдалося згенерувати PDF", { description: e.message });
      }
      qc.invalidateQueries({ queryKey: ["client", contract.client_id] });
    },
    onError: (e: any) => toast.error("Не вдалося підтвердити", { description: e.message }),
  });

  const chargesRetry = useMutation({
    mutationFn: () => chargesFn({ data: { contractId: contract.id } }),
    onSuccess: () => { toast.success("Нарахування створено"); qc.invalidateQueries({ queryKey: ["client", contract.client_id] }); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const pdfRetry = useMutation({
    mutationFn: () => pdfFn({ data: { contractId: contract.id } }),
    onSuccess: () => { toast.success("PDF згенеровано"); qc.invalidateQueries({ queryKey: ["client", contract.client_id] }); },
    onError: (e: any) => toast.error("Помилка PDF", { description: e.message }),
  });

  const openPdf = useMutation({
    mutationFn: () => urlFn({ data: { contractId: contract.id } }),
    onSuccess: (res: any) => { if (res?.url) window.open(res.url, "_blank", "noopener"); },
    onError: (e: any) => toast.error("Не вдалося відкрити PDF", { description: e.message }),
  });

  const plans = lookups?.plans ?? [];
  const prices = (lookups?.prices ?? []).filter((p: any) => !merged.plan_id || p.plan_id === merged.plan_id);
  const services = (lookups?.services ?? []).filter((s: any) => s.branch_id === contract.branch_id);

  return (
    <SectionCard>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Договір</p>
          <p className="font-semibold">№ {contract.number}</p>
        </div>
        <StatusPill status={contract.status} />
      </div>

      <WorkflowStatuses
        clientCreated
        childCreated
        contractConfirmed={isConfirmed}
        chargesGenerated={isConfirmed}
        pdfGenerated={hasPdf}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Послуга *">
          <Select value={merged.service_id ?? ""} onValueChange={(v) => setPatch({ ...patch, service_id: v })} disabled={!isDraft}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Тарифний план *">
          <Select value={merged.plan_id ?? ""} onValueChange={(v) => setPatch({ ...patch, plan_id: v, price_version_id: null })} disabled={!isDraft}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Версія цін *">
          <Select value={merged.price_version_id ?? ""} onValueChange={(v) => {
            const pv = prices.find((p: any) => p.id === v);
            setPatch({ ...patch, price_version_id: v, monthly_price: pv ? Number(pv.monthly_price) : merged.monthly_price });
          }} disabled={!isDraft || !merged.plan_id}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{prices.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.monthly_price} ₴</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Знижка">
          <Select value={merged.discount_id ?? ""} onValueChange={(v) => setPatch({ ...patch, discount_id: v || null })} disabled={!isDraft}>
            <SelectTrigger><SelectValue placeholder="Без знижки" /></SelectTrigger>
            <SelectContent>{(lookups?.discounts ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name} ({d.type === "percentage" ? `${d.value}%` : `${d.value} ₴`})</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Місячна ціна (₴) *"><Input type="number" value={merged.monthly_price ?? 0} onChange={(e) => setPatch({ ...patch, monthly_price: e.target.value })} disabled={!isDraft} /></Field>
        <Field label="Ручна знижка (₴)"><Input type="number" value={merged.manual_discount ?? 0} onChange={(e) => setPatch({ ...patch, manual_discount: e.target.value })} disabled={!isDraft} /></Field>
        <Field label="Дата початку *"><Input type="date" value={merged.start_date ?? ""} onChange={(e) => setPatch({ ...patch, start_date: e.target.value })} disabled={!isDraft} /></Field>
        <Field label="Дата закінчення"><Input type="date" value={merged.end_date ?? ""} onChange={(e) => setPatch({ ...patch, end_date: e.target.value })} disabled={!isDraft} /></Field>
        <Field label="Коментар" wide>
          <Textarea rows={2} value={merged.comment ?? ""} onChange={(e) => setPatch({ ...patch, comment: e.target.value })} disabled={!isDraft} />
        </Field>
      </div>

      {isDraft ? (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {Object.keys(patch).length > 0 ? (
            <>
              <Button variant="ghost" onClick={() => setPatch({})}>Скинути</Button>
              <SecondaryButton onClick={() => save.mutate()} disabled={save.isPending}>Зберегти чернетку</SecondaryButton>
            </>
          ) : null}
          <PrimaryButton onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
            {confirmMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Підтвердити договір
          </PrimaryButton>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <SecondaryButton onClick={() => chargesRetry.mutate()} disabled={chargesRetry.isPending}>
            {chargesRetry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Перегенерувати нарахування
          </SecondaryButton>
          <SecondaryButton onClick={() => pdfRetry.mutate()} disabled={pdfRetry.isPending}>
            {pdfRetry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {hasPdf ? "Перегенерувати PDF" : "Згенерувати PDF"}
          </SecondaryButton>
        </div>
      )}

      {attachment ? (
        <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>{attachment.name}</span>
            <span className="text-xs text-muted-foreground">{format(new Date(attachment.created_at), "dd.MM.yyyy HH:mm")}</span>
          </div>
          <button
            type="button"
            onClick={() => openPdf.mutate()}
            disabled={openPdf.isPending}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
          >
            {openPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Відкрити
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Чернетка", cls: "bg-muted text-muted-foreground" },
    confirmed: { label: "Підтверджено", cls: "bg-primary/10 text-primary" },
    generated: { label: "Згенеровано", cls: "bg-primary/10 text-primary" },
    sent: { label: "Надіслано", cls: "bg-blue-500/10 text-blue-600" },
    signed: { label: "Підписано", cls: "bg-emerald-500/10 text-emerald-600" },
    cancelled: { label: "Скасовано", cls: "bg-destructive/10 text-destructive" },
    completed: { label: "Завершено", cls: "bg-emerald-500/10 text-emerald-600" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function WorkflowStatuses(props: {
  clientCreated: boolean; childCreated: boolean;
  contractConfirmed: boolean; chargesGenerated: boolean; pdfGenerated: boolean;
}) {
  const steps: { label: string; done: boolean; pending?: boolean }[] = [
    { label: "Клієнт створений", done: props.clientCreated },
    { label: "Дитина створена", done: props.childCreated },
    { label: props.contractConfirmed ? "Договір підтверджено" : "Потрібні деталі договору", done: props.contractConfirmed, pending: !props.contractConfirmed },
    { label: "Нарахування створені", done: props.chargesGenerated },
    { label: "PDF згенеровано", done: props.pdfGenerated },
  ];
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
      {steps.map((s, i) => (
        <li key={i} className={`inline-flex items-center gap-1.5 ${s.done ? "text-emerald-600" : s.pending ? "text-amber-600" : "text-muted-foreground"}`}>
          {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.pending ? <AlertCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}


function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`grid gap-1.5 ${wide ? "md:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
