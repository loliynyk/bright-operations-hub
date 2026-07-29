import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Loader2, User, Baby, FileText } from "lucide-react";
import { PageContainer, SectionCard, StatusBadge, PrimaryButton, SecondaryButton } from "@/components/ds";
import { RelatedRecordsSection, EntityLink } from "@/components/ds/related-records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLead, saveLead } from "@/lib/leads.functions";
import { convertLeadToClient } from "@/lib/admissions.functions";
import { LEAD_SOURCES } from "@/lib/leads";
import { useLeadStatuses } from "@/lib/hooks/use-lead-statuses";
import { Timeline } from "@/components/timeline";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getLead);
  const saveFn = useServerFn(saveLead);
  const convertFn = useServerFn(convertLeadToClient);
  const statuses = useLeadStatuses();

  const { data, isLoading } = useQuery({ queryKey: ["lead", id], queryFn: () => getFn({ data: { id } }) });

  const [form, setForm] = useState<any>(null);
  const current = form ?? data?.lead;

  const save = useMutation({
    mutationFn: (patch: any) => saveFn({ data: { id, ...patch } as any }),
    onSuccess: () => {
      toast.success("Збережено");
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      setForm(null);
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const convert = useMutation({
    mutationFn: () => convertFn({ data: { leadId: id } }),
    onSuccess: (res) => {
      toast.success("Клієнта створено");
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (res?.clientId) navigate({ to: "/clients/$id", params: { id: res.clientId } });
    },
    onError: (e: any) => toast.error("Не вдалося конвертувати", { description: e.message }),
  });

  if (isLoading || !data) return <PageContainer><p className="text-muted-foreground">Завантаження...</p></PageContainer>;
  const lead = data.lead;
  const update = (patch: any) => setForm({ ...(form ?? lead), ...patch });

  return (
    <PageContainer>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/leads" })}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Лід</p>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.parent_name}</h1>
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(lead.status)}`}>
            {statusLabel(lead.status)}
          </span>
        </div>
        <div className="flex gap-2">
          {lead.converted_client_id ? (
            <Link to="/clients/$id" params={{ id: lead.converted_client_id }}>
              <SecondaryButton>Перейти до клієнта</SecondaryButton>
            </Link>
          ) : (
            <PrimaryButton onClick={() => convert.mutate()} disabled={convert.isPending}>
              {convert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Створити клієнта
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Основна інформація">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ім'я батька"><Input value={current?.parent_first_name ?? ""} onChange={(e) => update({ parent_first_name: e.target.value })} /></Field>
              <Field label="Прізвище"><Input value={current?.parent_last_name ?? ""} onChange={(e) => update({ parent_last_name: e.target.value })} /></Field>
              <Field label="Телефон"><Input value={current?.parent_phone ?? ""} onChange={(e) => update({ parent_phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={current?.parent_email ?? ""} onChange={(e) => update({ parent_email: e.target.value })} /></Field>
              <Field label="Адреса" wide><Input value={current?.parent_address ?? ""} onChange={(e) => update({ parent_address: e.target.value })} /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Дитина">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ім'я"><Input value={current?.child_first_name ?? ""} onChange={(e) => update({ child_first_name: e.target.value })} /></Field>
              <Field label="Прізвище"><Input value={current?.child_last_name ?? ""} onChange={(e) => update({ child_last_name: e.target.value })} /></Field>
              <Field label="Дата народження"><Input type="date" value={current?.child_birthdate ?? ""} onChange={(e) => update({ child_birthdate: e.target.value })} /></Field>
              <Field label="Бажана дата старту"><Input type="date" value={current?.desired_start_date ?? ""} onChange={(e) => update({ desired_start_date: e.target.value })} /></Field>
            </div>
          </SectionCard>

          <SectionCard title="Нотатки">
            <Textarea rows={4} value={current?.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} />
          </SectionCard>

          {form ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Скасувати</Button>
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Зберегти
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <SectionCard title="Статус">
            <Select value={current?.status ?? "new"} onValueChange={(v) => save.mutate({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </SectionCard>
          <SectionCard title="Джерело">
            <Select value={current?.source ?? ""} onValueChange={(v) => save.mutate({ source: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </SectionCard>

          <RelatedRecordsSection description="Клієнт і діти, створені з цього ліда.">
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
              <p className="text-sm text-muted-foreground">Клієнт ще не створений з цього ліда.</p>
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

          <SectionCard title="Історія">
            <Timeline events={data.events as any} />
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`grid gap-1.5 ${wide ? "md:col-span-2" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}
