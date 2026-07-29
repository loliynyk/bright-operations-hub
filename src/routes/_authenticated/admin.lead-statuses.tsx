import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tags, Trash2 } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PrimaryButton, StatusBadge } from "@/components/ds";
import { ConfirmDeleteDialog } from "@/components/ds/confirm-delete-dialog";
import { listLeadStatuses, upsertLeadStatus, deleteLeadStatus, setLeadStatusActive } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/lead-statuses")({
  component: LeadStatusesPage,
});

const TONE_OPTIONS: { label: string; value: string }[] = [
  { label: "Синій", value: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { label: "Індиго", value: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  { label: "Сірий", value: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  { label: "Фіолетовий", value: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { label: "Фуксія", value: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300" },
  { label: "Рожевий", value: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  { label: "Бурштин", value: "bg-amber-500/20 text-amber-800 dark:text-amber-300" },
  { label: "Бірюзовий", value: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  { label: "Смарагдовий", value: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { label: "Малиновий", value: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { label: "Нейтральний", value: "bg-muted text-muted-foreground" },
];

function LeadStatusesPage() {
  const listFn = useServerFn(listLeadStatuses);
  const upsertFn = useServerFn(upsertLeadStatus);
  const deleteFn = useServerFn(deleteLeadStatus);
  const setActiveFn = useServerFn(setLeadStatusActive);

  return (
    <SettingsShell
      title="Статуси лідів"
      description="Керуйте назвами, кольорами та порядком статусів лідів. Код фіксується під час створення. Системні статуси захищені від видалення."
      icon={Tags}
      listQueryKey={["lead-statuses"]}
      listFn={() => listFn() as any}
      archiveFn={async ({ id, is_active }) => {
        await setActiveFn({ data: { id, is_active } });
      }}
      addLabel="Створити статус"
      columns={[
        {
          header: "Назва",
          render: (r: any) => (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.tone}`}>{r.label}</span>
          ),
        },
        { header: "Код", render: (r: any) => <code className="text-xs text-muted-foreground">{r.code}</code> },
        { header: "Порядок", render: (r: any) => <span className="text-muted-foreground">{r.sort_order}</span> },
        {
          header: "Тип",
          render: (r: any) =>
            r.is_system ? <StatusBadge tone="info">Системний</StatusBadge> : <span className="text-xs text-muted-foreground">—</span>,
        },
      ]}
      renderForm={({ row, onDone }) => (
        <StatusForm
          row={row}
          onSave={(v: any) => upsertFn({ data: v }).then(() => { toast.success("Збережено"); onDone(); })}
          onDelete={row ? () => deleteFn({ data: { id: row.id } }).then(() => { toast.success("Видалено"); onDone(); }) : undefined}
        />
      )}
    />
  );
}

function StatusForm({ row, onSave, onDelete }: { row: any | null; onSave: (v: any) => Promise<void>; onDelete?: () => Promise<void> }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    id: row?.id,
    code: row?.code ?? "",
    label: row?.label ?? "",
    tone: row?.tone ?? TONE_OPTIONS[TONE_OPTIONS.length - 1].value,
    sort_order: row?.sort_order ?? 100,
    is_active: row?.is_active ?? true,
    is_system: row?.is_system ?? false,
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const save = useMutation({
    mutationFn: () => onSave({
      id: v.id,
      code: v.code.trim(),
      label: v.label.trim(),
      tone: v.tone,
      sort_order: Number(v.sort_order) || 0,
      is_active: v.is_active,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-statuses"] }),
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  const del = useMutation({
    mutationFn: () => onDelete!(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-statuses"] }),
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const codeLocked = !!row && !!v.is_system;
  const activeLocked = !!row && (v.code === "new" || v.code === "converted");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Код</Label>
          <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} disabled={codeLocked} placeholder="new_status" />
          {codeLocked ? <p className="mt-1 text-xs text-muted-foreground">Системний код не редагується.</p> : null}
        </div>
        <div>
          <Label>Назва</Label>
          <Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="Новий" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Порядок</Label>
          <Input type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Активний</Label>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={v.is_active} onCheckedChange={(c) => setV({ ...v, is_active: c })} disabled={activeLocked} />
            <span className="text-sm text-muted-foreground">
              {v.is_active ? "Доступний для призначення" : "Прихований у виборах, історія видима"}
            </span>
          </div>
          {activeLocked ? <p className="mt-1 text-xs text-muted-foreground">Обов'язковий статус.</p> : null}
        </div>
      </div>
      <div>
        <Label>Колір</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TONE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setV({ ...v, tone: t.value })}
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${t.value} ${v.tone === t.value ? "ring-2 ring-primary" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && !v.is_system ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDel(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Видалити
            </Button>
          ) : null}
        </div>
        <PrimaryButton onClick={() => save.mutate()} disabled={!v.code || !v.label || save.isPending}>Зберегти</PrimaryButton>
      </div>
      {confirmDel ? (
        <ConfirmDeleteDialog
          open={confirmDel}
          onOpenChange={setConfirmDel}
          entityName={v.label || "статус"}
          variant="delete"
          impact="Статус буде видалено. Заборонено, якщо він використовується у лідах."
          isPending={del.isPending}
          onConfirm={async () => { await del.mutateAsync(); setConfirmDel(false); }}
        />
      ) : null}
    </div>
  );
}
