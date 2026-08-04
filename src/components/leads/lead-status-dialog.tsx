import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/ds";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeLeadStatus } from "@/lib/lead-admissions.functions";
import { LEAD_CLOSE_REASONS } from "@/lib/lead-workflow";

/**
 * Status transition dialog. Enforces the per-status requirements up front:
 * an open status needs a next action, a closed status needs a reason.
 */
export function LeadStatusDialog({
  open,
  onOpenChange,
  leadId,
  status,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  status: { code: string; label: string; category?: string; requires_next_action?: boolean; requires_closing_reason?: boolean } | null;
  onDone: () => void;
}) {
  const fn = useServerFn(changeLeadStatus);
  const [v, setV] = useState<any>({ next_action_at: "", next_action_note: "", close_reason_code: "", close_reason_comment: "", visit_at: "" });
  const [busy, setBusy] = useState(false);
  if (!status) return null;

  const needsAction = !!status.requires_next_action;
  const needsReason = !!status.requires_closing_reason;
  const isVisit = status.code === "visit_scheduled";

  async function submit() {
    setBusy(true);
    try {
      await fn({
        data: {
          lead_id: leadId,
          status: status!.code,
          next_action_at: v.next_action_at ? new Date(v.next_action_at).toISOString() : null,
          next_action_note: v.next_action_note || null,
          close_reason_code: v.close_reason_code || null,
          close_reason_comment: v.close_reason_comment || null,
          visit_at: v.visit_at ? new Date(v.visit_at).toISOString() : null,
        },
      });
      toast.success("Статус змінено");
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Не вдалося змінити статус", { description: e.message });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || (needsAction && !v.next_action_at) || (needsReason && !v.close_reason_code);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Статус: {status.label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isVisit ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Дата й час огляду</Label>
              <Input type="datetime-local" value={v.visit_at} onChange={(e) => setV({ ...v, visit_at: e.target.value })} />
            </div>
          ) : null}
          {needsAction ? (
            <>
              <div className="grid gap-1.5">
                <Label className="text-xs">Наступна дія *</Label>
                <Input type="datetime-local" value={v.next_action_at} onChange={(e) => setV({ ...v, next_action_at: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Нотатка</Label>
                <Input value={v.next_action_note} onChange={(e) => setV({ ...v, next_action_note: e.target.value })} />
              </div>
            </>
          ) : null}
          {needsReason ? (
            <>
              <div className="grid gap-1.5">
                <Label className="text-xs">Причина закриття *</Label>
                <Select value={v.close_reason_code} onValueChange={(x) => setV({ ...v, close_reason_code: x })}>
                  <SelectTrigger><SelectValue placeholder="Оберіть причину" /></SelectTrigger>
                  <SelectContent>
                    {LEAD_CLOSE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Коментар</Label>
                <Textarea rows={2} value={v.close_reason_comment} onChange={(e) => setV({ ...v, close_reason_comment: e.target.value })} />
              </div>
            </>
          ) : null}
          {!needsAction && !needsReason && !isVisit ? (
            <p className="text-sm text-muted-foreground">Додаткові дані для цього статусу не потрібні.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button>
          <PrimaryButton onClick={submit} disabled={disabled}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Змінити статус
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
