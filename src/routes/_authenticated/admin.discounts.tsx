import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/ds";
import { listDiscounts, upsertDiscount, archiveDiscount } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/discounts")({
  component: DiscountsPage,
});

function DiscountsPage() {
  const listFn = useServerFn(listDiscounts);
  const upsertFn = useServerFn(upsertDiscount);
  const archiveFn = useServerFn(archiveDiscount);
  return (
    <SettingsShell
      title="Знижки"
      description="Відсоткові або фіксовані знижки."
      icon={Percent}
      listQueryKey={["discounts"]}
      listFn={() => listFn()}
      archiveFn={(d) => archiveFn({ data: d })}
      addLabel="Створити знижку"
      columns={[
        { header: "Назва", render: (r: any) => r.name },
        { header: "Тип", render: (r: any) => r.type === "percentage" ? "Відсоток" : "Фіксована" },
        { header: "Значення", render: (r: any) => r.type === "percentage" ? `${r.value}%` : `${Number(r.value).toFixed(0)} ₴` },
        { header: "Період", render: (r: any) => r.valid_from || r.valid_to ? `${r.valid_from ?? "…"} – ${r.valid_to ?? "…"}` : "—" },
      ]}
      renderForm={({ row, onDone }) => (
        <DiscountForm row={row} onSubmit={(v) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })} />
      )}
    />
  );
}

function DiscountForm({ row, onSubmit }: any) {
  const [v, setV] = useState({
    id: row?.id,
    name: row?.name ?? "",
    type: (row?.type ?? "percentage") as "percentage" | "fixed",
    value: row?.value ?? 0,
    valid_from: row?.valid_from ?? null,
    valid_to: row?.valid_to ?? null,
    is_active: row?.is_active ?? true,
  });
  const m = useMutation({ mutationFn: () => onSubmit(v) });
  return (
    <div className="space-y-3">
      <div><Label>Назва</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Тип</Label>
          <Select value={v.type} onValueChange={(x: any) => setV({ ...v, type: x })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Відсоток</SelectItem>
              <SelectItem value="fixed">Фіксована сума</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Значення</Label><Input type="number" value={v.value} onChange={(e) => setV({ ...v, value: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Діє з</Label><Input type="date" value={v.valid_from ?? ""} onChange={(e) => setV({ ...v, valid_from: e.target.value || null })} /></div>
        <div><Label>Діє до</Label><Input type="date" value={v.valid_to ?? ""} onChange={(e) => setV({ ...v, valid_to: e.target.value || null })} /></div>
      </div>
      <div className="flex justify-end"><PrimaryButton onClick={() => m.mutate()} disabled={!v.name}>Зберегти</PrimaryButton></div>
    </div>
  );
}
