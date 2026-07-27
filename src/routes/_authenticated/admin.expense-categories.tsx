import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tags } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/ds";
import { listExpenseCategories, upsertExpenseCategory, archiveExpenseCategory } from "@/lib/settings.functions";
import { listLookups } from "@/lib/lookups.functions";

export const Route = createFileRoute("/_authenticated/admin/expense-categories")({
  component: ExpCatsPage,
});

function ExpCatsPage() {
  const listFn = useServerFn(listExpenseCategories);
  const upsertFn = useServerFn(upsertExpenseCategory);
  const archiveFn = useServerFn(archiveExpenseCategory);
  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });
  return (
    <SettingsShell
      title="Категорії витрат"
      description="Групування витрат для P&L та звітів."
      icon={Tags}
      listQueryKey={["expense-categories"]}
      listFn={() => listFn()}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Створити категорію"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Філія", render: (r: any) => (lookups?.branches ?? []).find((b: any) => b.id === r.branch_id)?.name ?? "Всі" },
      ]}
      renderForm={({ row, onDone }) => (
        <ECForm row={row} branches={lookups?.branches ?? []} onSubmit={(v: any) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })} />
      )}
    />
  );
}

function ECForm({ row, branches, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? null,
    name: row?.name ?? "",
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({ mutationFn: () => onSubmit(v) });
  return (
    <div className="space-y-3">
      <div><Label>Назва</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
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
