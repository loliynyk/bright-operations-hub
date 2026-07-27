import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/ds";
import { listPaymentMethods, upsertPaymentMethod, archivePaymentMethod } from "@/lib/settings.functions";
import { listLookups } from "@/lib/lookups.functions";

const TYPES = [
  { v: "cash", l: "Готівка" },
  { v: "bank", l: "Банк" },
  { v: "card", l: "Термінал" },
  { v: "online", l: "Онлайн" },
  { v: "other", l: "Інше" },
];

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  component: PaymentMethodsPage,
});

function PaymentMethodsPage() {
  const listFn = useServerFn(listPaymentMethods);
  const upsertFn = useServerFn(upsertPaymentMethod);
  const archiveFn = useServerFn(archivePaymentMethod);
  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });
  return (
    <SettingsShell
      title="Методи оплати"
      description="Готівка, банк, термінал, онлайн."
      icon={CreditCard}
      listQueryKey={["payment-methods"]}
      listFn={() => listFn()}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Створити метод"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Тип", render: (r: any) => TYPES.find((t) => t.v === r.type)?.l ?? "—" },
        { header: "Філія", render: (r: any) => (lookups?.branches ?? []).find((b: any) => b.id === r.branch_id)?.name ?? "Всі" },
      ]}
      renderForm={({ row, onDone }) => (
        <PMForm row={row} branches={lookups?.branches ?? []} onSubmit={(v) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })} />
      )}
    />
  );
}

function PMForm({ row, branches, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? null,
    name: row?.name ?? "",
    type: row?.type ?? "cash",
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({ mutationFn: () => onSubmit(v) });
  return (
    <div className="space-y-3">
      <div><Label>Назва</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Тип</Label>
        <Select value={v.type} onValueChange={(x) => setV({ ...v, type: x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Філія</Label>
        <Select value={v.branch_id ?? "__all"} onValueChange={(x) => setV({ ...v, branch_id: x === "__all" ? null : x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Всі філії</SelectItem>
            {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end"><PrimaryButton onClick={() => m.mutate()} disabled={!v.name}>Зберегти</PrimaryButton></div>
    </div>
  );
}
