import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Baby, FileText, Loader2, Trash2, User, UserPlus } from "lucide-react";
import { PageContainer, SectionCard, StatusBadge, PrimaryButton, SecondaryButton } from "@/components/ds";
import { RelatedRecordsSection, EntityLink } from "@/components/ds/related-records";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLead, saveLead } from "@/lib/leads.functions";
import { getLeadWorkflow, hardDeleteLead } from "@/lib/lead-admissions.functions";
import { LEAD_SOURCES } from "@/lib/leads";
import { LEAD_CLOSE_REASONS, PREFERRED_CHANNELS, labelOf } from "@/lib/lead-workflow";
import { useLeadStatuses } from "@/lib/hooks/use-lead-statuses";
import { Timeline } from "@/components/timeline";
import { LeadChildrenTab } from "@/components/leads/lead-children-tab";
import { LeadLegalTab } from "@/components/leads/lead-legal-tab";
import { LeadContractTab } from "@/components/leads/lead-contract-tab";
import { LeadCommunicationTab } from "@/components/leads/lead-communication-tab";
import { LeadConvertDialog } from "@/components/leads/lead-convert-dialog";
import { LeadStatusDialog } from "@/components/leads/lead-status-dialog";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getLead);
  const saveFn = useServerFn(saveLead);
  const workflowFn = useServerFn(getLeadWorkflow);
  const deleteFn = useServerFn(hardDeleteLead);
  const statuses = useLeadStatuses();

  const { data, isLoading } = useQuery({ queryKey: ["lead", id], queryFn: () => getFn({ data: { id } }) });
  const { data: wf } = useQuery({ queryKey: ["lead-workflow", id], queryFn: () => workflowFn({ data: { leadId: id } }) });

  const [form, setForm] = useState<any>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead", id] });
    qc.invalidateQueries({ queryKey: ["lead-workflow", id] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const save = useMutation({
    mutationFn: (patch: any) => saveFn({ data: { id, ...patch } as any }),
    onSuccess: () => { toast.success("Збережено"); refresh(); setForm(null); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Лід видалено");
      qc.invalidateQueries({ queryKey: ["leads"] });
      navigate({ to: "/leads" });
    },
    onError: (e: any) => toast.error("Видалення заборонено", { description: e.message }),
  });

  if (isLoading || !data) return <PageContainer><p className="text-muted-foreground">Завантаження...</p></PageContainer>;

  const lead: any = data.lead;
  const current = form ?? lead;
  const update = (patch: any) => setForm({ ...(form ?? lead), ...patch });
  const converted = !!lead.converted_client_id;
  const privileged = !!wf?.privileged;
  const isAdmin = !!wf?.isAdmin;
  const readOnly = converted;

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/leads" })}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Заявка</p>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.parent_name}</h1>
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statuses.tone(lead.status)}`}>
            {statuses.label(lead.status)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {converted ? (
            <Link to="/clients/$id" params={{ id: lead.converted_client_id }}>
              <SecondaryButton>Перейти до клієнта</SecondaryButton>
            </Link>
          ) : (
            <>
              {isAdmin ? (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Видалити
                </Button>
              ) : null}
              {privileged ? (
                <PrimaryButton onClick={() => setConvertOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Конвертувати в клієнта
                </PrimaryButton>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tabs defaultValue="main">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="main">Основна інформація</TabsTrigger>
              <TabsTrigger value="children">Дитина</TabsTrigger>
              <TabsTrigger value="legal">Юридичні дані</TabsTrigger>
              <TabsTrigger value="tariff">Вступ та тариф</TabsTrigger>
              <TabsTrigger value="contract">Договір</TabsTrigger>
              <TabsTrigger value="comm">Комунікація</TabsTrigger>
              <TabsTrigger value="history">Історія</TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="mt-4 space-y-4">
              <SectionCard title="Представник">
                <div className="grid gap-4 md:grid-cols-2">
                  <F label="Ім'я"><Input disabled={readOnly} value={current?.parent_first_name ?? ""} onChange={(e) => update({ parent_first_name: e.target.value })} /></F>
                  <F label="Прізвище"><Input disabled={readOnly} value={current?.parent_last_name ?? ""} onChange={(e) => update({ parent_last_name: e.target.value })} /></F>
                  <F label="Телефон"><Input disabled={readOnly} value={current?.parent_phone ?? ""} onChange={(e) => update({ parent_phone: e.target.value })} /></F>
                  <F label="Email"><Input disabled={readOnly} value={current?.parent_email ?? ""} onChange={(e) => update({ parent_email: e.target.value })} /></F>
                  <F label="Адреса" wide><Input disabled={readOnly} value={current?.parent_address ?? ""} onChange={(e) => update({ parent_address: e.target.value })} /></F>
                  <F label="Бажаний канал зв'язку">
                    <Select disabled={readOnly} value={current?.preferred_channel ?? ""} onValueChange={(v) => update({ preferred_channel: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {PREFERRED_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </F>
                  <F label="Джерело">
                    <Select disabled={readOnly} value={current?.source ?? ""} onValueChange={(v) => update({ source: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </F>
                </div>
              </SectionCard>

              <SectionCard title="Нотатки">
                <Textarea disabled={readOnly} rows={4} value={current?.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
              </SectionCard>

              {form && !readOnly ? (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setForm(null)}>Скасувати</Button>
                  <PrimaryButton onClick={() => save.mutate(form)} disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Зберегти
                  </PrimaryButton>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="children" className="mt-4">
              <LeadChildrenTab
                leadId={id}
                branchId={lead.branch_id ?? null}
                children={wf?.children ?? []}
                isAdmin={isAdmin}
                readOnly={readOnly}
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="legal" className="mt-4">
              <LeadLegalTab
                key={wf?.legal?.id ?? "new"}
                leadId={id}
                legal={wf?.legal ?? null}
                privileged={privileged}
                readOnly={readOnly}
                onSaved={refresh}
              />
            </TabsContent>

            <TabsContent value="tariff" className="mt-4 space-y-4">
              <SectionCard
                title="Вступ та тариф"
                description="Тариф фіксується для кожної дитини окремо у вкладці «Дитина». Тут — підсумок погодженої вартості."
              >
                {(wf?.children ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Додайте дитину, щоб зафіксувати тариф.</p>
                ) : (
                  <div className="space-y-2">
                    {(wf?.children ?? []).map((c: any) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3 text-sm">
                        <span className="font-medium">{[c.last_name, c.first_name].filter(Boolean).join(" ")}</span>
                        <span className="text-muted-foreground">
                          база {c.base_price ?? "—"} ₴ · знижка {Number(c.discount_value) || 0}
                          {c.discount_type === "percentage" ? "%" : " ₴"}
                        </span>
                        <span className="font-semibold">{c.final_price ?? "—"} ₴/міс</span>
                        {Number(c.discount_value) ? (
                          c.approved_by ? <StatusBadge tone="success">Знижку погоджено</StatusBadge>
                            : <StatusBadge tone="warning">Знижка не погоджена</StatusBadge>
                        ) : null}
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                      <span>Разом на місяць</span>
                      <span>
                        {(wf?.children ?? []).reduce((s: number, c: any) => s + Number(c.final_price ?? 0), 0)} ₴
                      </span>
                    </div>
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            <TabsContent value="contract" className="mt-4">
              <LeadContractTab
                key={wf?.contract?.id ?? "none"}
                leadId={id}
                lead={lead}
                contract={wf?.contract ?? null}
                files={wf?.files ?? []}
                privileged={privileged}
                readOnly={readOnly}
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="comm" className="mt-4">
              <LeadCommunicationTab
                leadId={id}
                lead={lead}
                attempts={wf?.attempts ?? []}
                readOnly={readOnly}
                onChanged={refresh}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <SectionCard title="Історія">
                <Timeline events={data.events as any} />
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <SectionCard title="Статус" description="Зміна статусу може вимагати наступної дії або причини закриття.">
            <Select
              value={lead.status ?? "new"}
              onValueChange={(v) => {
                const row = statuses.byCode.get(v);
                if (!row || readOnly) return;
                setStatusTarget(row);
              }}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statuses.assignableFor(lead.status)
                  .filter((s) => s.category !== "converted")
                  .map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {lead.close_reason_code ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Причина закриття: {labelOf(LEAD_CLOSE_REASONS, lead.close_reason_code)}
                {lead.close_reason_comment ? ` — ${lead.close_reason_comment}` : ""}
              </p>
            ) : null}
            {lead.next_action_at ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Наступна дія: {new Date(lead.next_action_at).toLocaleString("uk-UA")}
              </p>
            ) : null}
          </SectionCard>

          <RelatedRecordsSection description="Клієнт і діти, створені з цієї заявки.">
            {data.related?.client ? (
              <EntityLink
                to="/clients/$id"
                params={{ id: data.related.client.id }}
                icon={<User className="h-4 w-4" />}
                label={`${data.related.client.parent_first_name ?? ""} ${data.related.client.parent_last_name ?? ""}`.trim() || "Клієнт"}
                sublabel={data.related.client.phone ?? data.related.client.email ?? undefined}
                right="Клієнт"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Клієнт ще не створений з цієї заявки.</p>
            )}
            {(data.related?.children ?? []).map((k: any) => (
              <EntityLink
                key={k.id}
                to="/clients/children/$id"
                params={{ id: k.id }}
                icon={<Baby className="h-4 w-4" />}
                label={`${k.first_name ?? ""} ${k.last_name ?? ""}`.trim() || "Дитина"}
                sublabel={k.birth_date ?? undefined}
                right="Дитина"
              />
            ))}
            {(data.related?.contracts ?? []).map((c: any) => (
              <EntityLink
                key={c.id}
                to="/clients/$id"
                params={{ id: data.related.client!.id }}
                search={{ tab: "contract" }}
                icon={<FileText className="h-4 w-4" />}
                label={`Договір № ${c.number}`}
                sublabel={c.start_date ?? undefined}
                right={c.status}
              />
            ))}
          </RelatedRecordsSection>
        </div>
      </div>

      <LeadStatusDialog
        open={!!statusTarget}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        leadId={id}
        status={statusTarget}
        onDone={refresh}
      />

      {convertOpen ? (
        <LeadConvertDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          leadId={id}
          lead={lead}
          children={wf?.children ?? []}
          contract={wf?.contract ?? null}
          onConverted={(res) => {
            setConvertOpen(false);
            refresh();
            qc.invalidateQueries({ queryKey: ["clients"] });
            if (res?.client_id) navigate({ to: "/clients/$id", params: { id: res.client_id } });
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          entityName={lead.parent_name}
          variant="delete"
          impact="Заявку та всі пов'язані дані (діти, юридичні дані, договір, комунікації) буде видалено назавжди."
          isPending={del.isPending}
          onConfirm={() => del.mutateAsync()}
        />
      ) : null}
    </PageContainer>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`grid gap-1.5 ${wide ? "md:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
