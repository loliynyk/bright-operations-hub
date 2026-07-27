import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { listGroups, upsertGroup, archiveGroup } from "@/lib/settings.functions";
import { listLookups } from "@/lib/lookups.functions";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_authenticated/admin/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const { branch } = useBranch();
  const listFn = useServerFn(listGroups);
  const upsertFn = useServerFn(upsertGroup);
  const archiveFn = useServerFn(archiveGroup);
  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  return (
    <SettingsShell
      title="Групи"
      description="Групи вихованців по філіях."
      icon={Users}
      listQueryKey={["groups", branch.id]}
      listFn={() => listFn({ data: { branchId: branch.id } })}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Створити групу"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Вік", render: (r: any) => r.age_range || (r.age_from != null ? `${r.age_from}-${r.age_to ?? ""}` : "—") },
        { header: "Місткість", render: (r: any) => r.capacity ?? "—" },
      ]}
      renderForm={({ row, onDone }) => (
        <GroupForm
          row={row}
          branches={lookups?.branches ?? []}
          defaultBranch={branch.id}
          onSubmit={(v: any) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })}
        />
      )}
    />
  );
}

function GroupForm({ row, branches, defaultBranch, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? defaultBranch,
    name: row?.name ?? "",
    age_range: row?.age_range ?? "",
    age_from: row?.age_from ?? null,
    age_to: row?.age_to ?? null,
    capacity: row?.capacity ?? null,
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({ mutationFn: () => onSubmit(v), onError: (e: any) => toast.error("Помилка", { description: e.message }) });
  return (
    <div className="space-y-3">
      <div><Label>Філія</Label>
        <Select value={v.branch_id} onValueChange={(x) => setV({ ...v, branch_id: x })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Назва</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Вік від</Label><Input type="number" value={v.age_from ?? ""} onChange={(e) => setV({ ...v, age_from: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><Label>Вік до</Label><Input type="number" value={v.age_to ?? ""} onChange={(e) => setV({ ...v, age_to: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><Label>Місткість</Label><Input type="number" value={v.capacity ?? ""} onChange={(e) => setV({ ...v, capacity: e.target.value ? Number(e.target.value) : null })} /></div>
      </div>
      <div className="flex justify-end"><PrimaryButton onClick={() => m.mutate()} disabled={m.isPending || !v.name || !v.branch_id}>Зберегти</PrimaryButton></div>
    </div>
  );
}
