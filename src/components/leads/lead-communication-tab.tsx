import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, PhoneCall } from "lucide-react";
import { SectionCard, PrimaryButton } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logContactAttempt } from "@/lib/lead-admissions.functions";
import { LEAD_CONTACT_CHANNELS, LEAD_CONTACT_OUTCOMES, labelOf } from "@/lib/lead-workflow";

export function LeadCommunicationTab({
  leadId,
  lead,
  attempts,
  readOnly,
  onChanged,
}: {
  leadId: string;
  lead: any;
  attempts: any[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const logFn = useServerFn(logContactAttempt);
  const [v, setV] = useState<any>({ channel: "call", outcome: "no_answer", notes: "", next_action_at: "", next_action_note: "" });

  const log = useMutation({
    mutationFn: () =>
      logFn({
        data: {
          lead_id: leadId,
          channel: v.channel,
          outcome: v.outcome,
          notes: v.notes || null,
          next_action_at: v.next_action_at ? new Date(v.next_action_at).toISOString() : undefined,
          next_action_note: v.next_action_note || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Спробу контакту записано");
      setV({ ...v, notes: "", next_action_note: "" });
      onChanged();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <SectionCard title="Наступна дія" description="Планова дата контакту, за якою лід потрапляє в роботу.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Заплановано на</Label>
            <p className="text-sm">
              {lead?.next_action_at ? new Date(lead.next_action_at).toLocaleString("uk-UA") : "не заплановано"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Нотатка</Label>
            <p className="text-sm">{lead?.next_action_note ?? "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Спроб контакту: <span className="font-medium">{lead?.contact_attempt_count ?? 0}</span>
        </p>
      </SectionCard>

      {readOnly ? null : (
        <SectionCard title="Записати спробу контакту">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Канал</Label>
              <Select value={v.channel} onValueChange={(x) => setV({ ...v, channel: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_CONTACT_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Результат</Label>
              <Select value={v.outcome} onValueChange={(x) => setV({ ...v, outcome: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_CONTACT_OUTCOMES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label className="text-xs">Нотатка</Label>
              <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Наступна дія (дата й час)</Label>
              <Input type="datetime-local" value={v.next_action_at} onChange={(e) => setV({ ...v, next_action_at: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Нотатка до наступної дії</Label>
              <Input value={v.next_action_note} onChange={(e) => setV({ ...v, next_action_note: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <PrimaryButton onClick={() => log.mutate()} disabled={log.isPending}>
              {log.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
              Записати
            </PrimaryButton>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Журнал комунікацій">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записів ще немає.</p>
        ) : (
          <ul className="space-y-2">
            {attempts.map((a) => (
              <li key={a.id} className="rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {labelOf(LEAD_CONTACT_CHANNELS, a.channel)} · {labelOf(LEAD_CONTACT_OUTCOMES, a.outcome)}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(a.attempted_at).toLocaleString("uk-UA")}</span>
                </div>
                {a.notes ? <p className="mt-1 text-muted-foreground">{a.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
