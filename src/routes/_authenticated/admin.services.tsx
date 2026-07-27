import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/ds";
import { listServices, upsertService, archiveService } from "@/lib/settings.functions";
import { listLookups } from "@/lib/lookups.functions";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_authenticated/admin/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const { branch } = useBranch();
  const listFn = useServerFn(listServices);
  const upsertFn = useServerFn(upsertService);
  const archiveFn = useServerFn(archiveService);
  const lookupsFn = useServerFn(listLookups);
  const { data: lookups } = useQuery({ queryKey: ["lookups"], queryFn: () => lookupsFn() });

  return (
    <SettingsShell
      title="Послуги"
      description="Що ви продаєте: Preschool, Half-day, Full-day, Camp, Club."
      icon={Briefcase}
      listQueryKey={["services", branch.id]}
      listFn={() => listFn({ data: { branchId: branch.id } })}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Створити послугу"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Опис", render: (r: any) => r.description ?? "—" },
      ]}
      renderForm={({ row, onDone }) => (
        <ServiceForm
          row={row}
          branches={lookups?.branches ?? []}
          defaultBranch={branch.id}
          onSubmit={(v: any) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })}
        />
      )}
    />
  );
}

function ServiceForm({ row, branches, defaultBranch, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    branch_id: row?.branch_id ?? defaultBranch,
    name: row?.name ?? "",
    description: row?.description ?? "",
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
      <div><Label>Опис</Label><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="flex justify-end"><PrimaryButton onClick={() => m.mutate()} disabled={m.isPending || !v.name}>Зберегти</PrimaryButton></div>
    </div>
  );
}
