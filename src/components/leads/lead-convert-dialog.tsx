import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/ds";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { convertLeadAtomic, findClientMatches } from "@/lib/lead-admissions.functions";
import { conversionChecklist } from "@/lib/lead-workflow";

export function LeadConvertDialog({
  open,
  onOpenChange,
  leadId,
  lead,
  children,
  contract,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  lead: any;
  children: any[];
  contract: any | null;
  onConverted: (res: any) => void;
}) {
  const { items, ready } = conversionChecklist({ lead, children, contract });
  const matchesFn = useServerFn(findClientMatches);
  const convertFn = useServerFn(convertLeadAtomic);
  const [target, setTarget] = useState<string>("new");
  const [busy, setBusy] = useState(false);

  const { data: matches } = useQuery({
    queryKey: ["lead-client-matches", leadId],
    queryFn: () => matchesFn({ data: { lead_id: leadId } }),
    enabled: open,
  });

  async function run() {
    setBusy(true);
    try {
      const res = await convertFn({
        data: { lead_id: leadId, existing_client_id: target === "new" ? null : target },
      });
      toast.success("Лід конвертовано");
      onConverted(res);
    } catch (e: any) {
      toast.error("Конвертація не виконана", { description: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Конвертація ліда в клієнта</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Готовність до конвертації</p>
            <ul className="space-y-1.5 text-sm">
              {items.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  {i.ok ? (
                    <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <span className={i.ok ? "text-muted-foreground" : ""}>{i.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {(matches?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Знайдено схожих клієнтів
              </p>
              <RadioGroup value={target} onValueChange={setTarget} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="new" id="c-new" />
                  <Label htmlFor="c-new" className="font-normal">Створити нового клієнта</Label>
                </div>
                {(matches ?? []).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <RadioGroupItem value={m.id} id={`c-${m.id}`} />
                    <Label htmlFor={`c-${m.id}`} className="font-normal">
                      {`${m.parent_last_name ?? ""} ${m.parent_first_name ?? ""}`.trim()} · {m.phone ?? m.email ?? "—"}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <p className="mt-2 text-xs text-muted-foreground">
                Об'єднання виконується лише за явним вибором — автоматичного злиття немає.
              </p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Операція атомарна: створюються клієнт, усі діти зі статусом «Очікує початку» та договори з погодженими цінами.
            Той самий договір залишається пов'язаним із лідом. Повторна конвертація заблокована.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button>
          <PrimaryButton onClick={run} disabled={!ready || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Конвертувати
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
