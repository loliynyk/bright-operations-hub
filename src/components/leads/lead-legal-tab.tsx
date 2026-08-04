import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { SectionCard, PrimaryButton } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveLeadLegal } from "@/lib/lead-admissions.functions";
import { LEAD_DOC_TYPES } from "@/lib/lead-workflow";

export function LeadLegalTab({
  leadId,
  legal,
  privileged,
  readOnly,
  onSaved,
}: {
  leadId: string;
  legal: any | null;
  privileged: boolean;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [v, setV] = useState<any>(legal ?? { lead_id: leadId, same_address: false });
  const saveFn = useServerFn(saveLeadLegal);
  const set = (patch: any) => setV((p: any) => ({ ...p, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...v,
          lead_id: leadId,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
        } as any,
      }),
    onSuccess: () => { toast.success("Юридичні дані збережено"); onSaved(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  if (!privileged) {
    return (
      <SectionCard title="Юридичні дані">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Доступ до паспортних та податкових даних мають лише адміністратор і менеджер.
        </div>
      </SectionCard>
    );
  }

  const disabled = readOnly;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Представник (законний представник)"
        description="Дані використовуються для договору та переносяться в картку клієнта під час конвертації."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <F label="Прізвище"><Input disabled={disabled} value={v.last_name ?? ""} onChange={(e) => set({ last_name: e.target.value })} /></F>
          <F label="Ім'я"><Input disabled={disabled} value={v.first_name ?? ""} onChange={(e) => set({ first_name: e.target.value })} /></F>
          <F label="По батькові"><Input disabled={disabled} value={v.patronymic ?? ""} onChange={(e) => set({ patronymic: e.target.value })} /></F>
          <F label="Дата народження"><Input disabled={disabled} type="date" value={v.birth_date ?? ""} onChange={(e) => set({ birth_date: e.target.value })} /></F>
          <F label="РНОКПП (ІПН)"><Input disabled={disabled} value={v.tax_id ?? ""} onChange={(e) => set({ tax_id: e.target.value })} placeholder="10 цифр" /></F>
        </div>
        <div className="mt-4 grid gap-4">
          <F label="Адреса реєстрації">
            <Input disabled={disabled} value={v.registered_address ?? ""} onChange={(e) => set({ registered_address: e.target.value })} />
          </F>
          <div className="flex items-center gap-2">
            <Switch
              disabled={disabled}
              checked={!!v.same_address}
              onCheckedChange={(c) => set({ same_address: c, actual_address: c ? v.registered_address : v.actual_address })}
            />
            <span className="text-sm text-muted-foreground">Фактична адреса збігається з адресою реєстрації</span>
          </div>
          {!v.same_address ? (
            <F label="Фактична адреса">
              <Input disabled={disabled} value={v.actual_address ?? ""} onChange={(e) => set({ actual_address: e.target.value })} />
            </F>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Документ, що посвідчує особу">
        <div className="grid gap-4 md:grid-cols-3">
          <F label="Тип документа">
            <Select disabled={disabled} value={v.doc_type ?? ""} onValueChange={(x) => set({ doc_type: x })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {LEAD_DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Серія"><Input disabled={disabled} value={v.doc_series ?? ""} onChange={(e) => set({ doc_series: e.target.value })} /></F>
          <F label="Номер"><Input disabled={disabled} value={v.doc_number ?? ""} onChange={(e) => set({ doc_number: e.target.value })} /></F>
          <F label="Запис №"><Input disabled={disabled} value={v.doc_record_number ?? ""} onChange={(e) => set({ doc_record_number: e.target.value })} /></F>
          <F label="Ким виданий"><Input disabled={disabled} value={v.doc_issuer ?? ""} onChange={(e) => set({ doc_issuer: e.target.value })} /></F>
          <F label="Дата видачі"><Input disabled={disabled} type="date" value={v.doc_issue_date ?? ""} onChange={(e) => set({ doc_issue_date: e.target.value })} /></F>
          <F label="Дійсний до"><Input disabled={disabled} type="date" value={v.doc_expiry_date ?? ""} onChange={(e) => set({ doc_expiry_date: e.target.value })} /></F>
        </div>
        <div className="mt-4">
          <Label className="text-xs">Примітки</Label>
          <Textarea disabled={disabled} rows={2} value={v.doc_notes ?? ""} onChange={(e) => set({ doc_notes: e.target.value })} />
        </div>
      </SectionCard>

      {readOnly ? null : (
        <div className="flex justify-end">
          <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Зберегти юридичні дані
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
