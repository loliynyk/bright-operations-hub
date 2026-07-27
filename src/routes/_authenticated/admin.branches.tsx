import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrimaryButton } from "@/components/ds";
import { listBranches, upsertBranch, archiveBranch } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/branches")({
  component: BranchesPage,
  head: () => ({
    meta: [
      { title: "Філії — Bright OS" },
      { name: "description", content: "Керуйте філіями мережі: назва, адреса, телефон." },
    ],
  }),
});

function BranchesPage() {
  const listFn = useServerFn(listBranches);
  const upsertFn = useServerFn(upsertBranch);
  const archiveFn = useServerFn(archiveBranch);

  return (
    <SettingsShell
      title="Філії"
      description="Всі філії мережі. Ця сторінка не фільтрується поточною філією."
      icon={Building2}
      listQueryKey={["branches-admin"]}
      listFn={() => listFn()}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Додати філію"
      emptyTitle="Ще немає філій"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Адреса", render: (r: any) => r.address ?? "—" },
        { header: "Телефон", render: (r: any) => r.phone ?? "—" },
      ]}
      renderForm={({ row, onDone }) => (
        <BranchForm
          row={row}
          onSubmit={(v: any) =>
            upsertFn({ data: v }).then(() => {
              toast.success("Збережено");
              onDone();
            })
          }
        />
      )}
    />
  );
}

function BranchForm({ row, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    name: row?.name ?? "",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({
    mutationFn: () =>
      onSubmit({
        ...v,
        address: v.address || null,
        phone: v.phone || null,
      }),
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  return (
    <div className="space-y-3">
      <div>
        <Label>Назва</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div>
        <Label>Адреса</Label>
        <Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
      </div>
      <div>
        <Label>Телефон</Label>
        <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <PrimaryButton onClick={() => m.mutate()} disabled={m.isPending || !v.name}>
          Зберегти
        </PrimaryButton>
      </div>
    </div>
  );
}
