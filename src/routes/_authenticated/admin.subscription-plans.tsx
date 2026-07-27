import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton, StatusBadge, EmptyState } from "@/components/ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listPlansWithPrices, upsertPlan, archivePlan, upsertPrice, archivePrice,
} from "@/lib/settings.functions";
import { listLookups } from "@/lib/lookups.functions";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_authenticated/admin/subscription-plans")({
  component: PlansPage,
});

function PlansPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const listFn = useServerFn(listPlansWithPrices);
  const upsertPlanFn = useServerFn(upsertPlan);
  const archivePlanFn = useServerFn(archivePlan);
  const upsertPriceFn = useServerFn(upsertPrice);
  const archivePriceFn = useServerFn(archivePrice);
  const lookupsFn = useServerFn(listLookups);

  const { data } = useQuery({
    queryKey: ["plans", branch.id],
    queryFn: () => listFn({ data: { branchId: branch.id } }),
  });
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });
  const [planForm, setPlanForm] = useState<any>(undefined);
  const [priceForm, setPriceForm] = useState<{ planId: string; row?: any } | undefined>(undefined);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plans", branch.id] });
  const savePlan = useMutation({
    mutationFn: (v: any) => upsertPlanFn({ data: v }),
    onSuccess: () => { toast.success("Збережено"); setPlanForm(undefined); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const archPlan = useMutation({
    mutationFn: (d: { id: string; is_active: boolean }) => archivePlanFn({ data: d }),
    onSuccess: invalidate,
  });
  const savePrice = useMutation({
    mutationFn: (v: any) => upsertPriceFn({ data: v }),
    onSuccess: () => { toast.success("Збережено"); setPriceForm(undefined); invalidate(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const archPrice = useMutation({
    mutationFn: (d: { id: string; is_active: boolean }) => archivePriceFn({ data: d }),
    onSuccess: invalidate,
  });

  const plans = data?.plans ?? [];
  const prices = data?.prices ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Тарифні плани"
        description="Плани та їх датовані версії цін."
        actions={
          <PrimaryButton size="sm" onClick={() => setPlanForm(null)}>
            <Plus className="mr-1.5 h-4 w-4" /> Створити план
          </PrimaryButton>
        }
      />
      {plans.length === 0 ? (
        <EmptyState icon={Package} title="Планів ще немає" description="Створіть перший тарифний план." />
      ) : (
        <div className="space-y-4">
          {plans.map((p: any) => {
            const planPrices = prices.filter((x: any) => x.plan_id === p.id);
            return (
              <SectionCard key={p.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? "Активний" : "Архів"}
                      </StatusBadge>
                    </div>
                    {p.description ? <p className="text-xs text-muted-foreground">{p.description}</p> : null}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPlanForm(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => archPlan.mutate({ id: p.id, is_active: !p.is_active })}>
                      {p.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPriceForm({ planId: p.id })}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Ціна
                    </Button>
                  </div>
                </div>
                {planPrices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Ще немає версій ціни.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 pr-4">Назва</th>
                        <th className="py-1.5 pr-4">Ціна</th>
                        <th className="py-1.5 pr-4">З</th>
                        <th className="py-1.5 pr-4">До</th>
                        <th className="py-1.5 pr-4">Статус</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {planPrices.map((pr: any) => (
                        <tr key={pr.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-4">{pr.name}</td>
                          <td className="py-1.5 pr-4">{Number(pr.monthly_price).toFixed(0)} ₴</td>
                          <td className="py-1.5 pr-4">{pr.valid_from}</td>
                          <td className="py-1.5 pr-4">{pr.valid_to ?? "—"}</td>
                          <td className="py-1.5 pr-4">
                            <StatusBadge tone={pr.is_active ? "success" : "neutral"}>
                              {pr.is_active ? "Активна" : "Архів"}
                            </StatusBadge>
                          </td>
                          <td className="py-1.5 pr-4 text-right">
                            <Button size="sm" variant="ghost" onClick={() => setPriceForm({ planId: p.id, row: pr })}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => archPrice.mutate({ id: pr.id, is_active: !pr.is_active })}>
                              {pr.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      <Dialog open={planForm !== undefined} onOpenChange={(o) => !o && setPlanForm(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{planForm ? "Редагувати план" : "Новий план"}</DialogTitle></DialogHeader>
          {planForm !== undefined ? (
            <PlanForm row={planForm} branches={lookups?.branches ?? []} onSubmit={(v: any) => savePlan.mutate(v)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={priceForm !== undefined} onOpenChange={(o) => !o && setPriceForm(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{priceForm?.row ? "Редагувати ціну" : "Нова ціна"}</DialogTitle></DialogHeader>
          {priceForm ? (
            <PriceForm planId={priceForm.planId} row={priceForm.row} onSubmit={(v: any) => savePrice.mutate(v)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PlanForm({ row, branches, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? null,
    name: row?.name ?? "",
    description: row?.description ?? "",
    is_active: row?.is_active ?? true,
  });
  return (
    <div className="space-y-3">
      <div><Label>Філія (необов'язково)</Label>
        <Select value={v.branch_id ?? "__all"} onValueChange={(x) => setV({ ...v, branch_id: x === "__all" ? null : x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Всі філії</SelectItem>
            {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Назва</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Опис</Label><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="flex justify-end"><PrimaryButton onClick={() => onSubmit(v)} disabled={!v.name}>Зберегти</PrimaryButton></div>
    </div>
  );
}

function PriceForm({ planId, row, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    plan_id: planId,
    name: row?.name ?? "",
    monthly_price: row?.monthly_price ?? 0,
    valid_from: row?.valid_from ?? new Date().toISOString().slice(0, 10),
    valid_to: row?.valid_to ?? null,
    is_active: row?.is_active ?? true,
  });
  return (
    <div className="space-y-3">
      <div><Label>Назва версії</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Місячна ціна (₴)</Label><Input type="number" value={v.monthly_price} onChange={(e) => setV({ ...v, monthly_price: Number(e.target.value) })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Діє з</Label><Input type="date" value={v.valid_from} onChange={(e) => setV({ ...v, valid_from: e.target.value })} /></div>
        <div><Label>Діє до</Label><Input type="date" value={v.valid_to ?? ""} onChange={(e) => setV({ ...v, valid_to: e.target.value || null })} /></div>
      </div>
      <div className="flex justify-end"><PrimaryButton onClick={() => onSubmit(v)} disabled={!v.name}>Зберегти</PrimaryButton></div>
    </div>
  );
}
