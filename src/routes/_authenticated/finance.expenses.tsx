import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, PrimaryButton } from "@/components/ds";
import { DataTable, formatDate, type DataTableColumn } from "@/components/ds/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBranch } from "@/lib/branch-context";
import { listExpenses, upsertExpense, deleteExpense } from "@/lib/expenses.functions";
import { listExpenseCategories } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/finance/expenses")({
  component: ExpensesPage,
  head: () => ({
    meta: [
      { title: "Витрати — Bright OS" },
      { name: "description", content: "Операційні витрати філії." },
    ],
  }),
});

function ExpensesPage() {
  const { branch } = useBranch();
  const qc = useQueryClient();
  const listFn = useServerFn(listExpenses);
  const catsFn = useServerFn(listExpenseCategories);
  const saveFn = useServerFn(upsertExpense);
  const delFn = useServerFn(deleteExpense);
  const [open, setOpen] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["expenses", branch.id],
    queryFn: () => listFn({ data: { branch_id: branch.id || null } }),
    enabled: !!branch.id,
  });
  const { data: cats = [] } = useQuery({ queryKey: ["expense-categories"], queryFn: () => catsFn() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Видалено");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const total = (data as any[]).reduce((s, r) => s + Number(r.amount), 0);

  const columns: DataTableColumn<any>[] = [
    {
      key: "spent_at",
      header: "Дата",
      sortAccessor: (r) => r.spent_at,
      render: (r) => <span className="text-muted-foreground">{formatDate(r.spent_at)}</span>,
    },
    {
      key: "category",
      header: "Категорія",
      sortAccessor: (r) => r.expense_categories?.name ?? "",
      render: (r) => <span>{r.expense_categories?.name ?? "—"}</span>,
    },
    { key: "description", header: "Опис", render: (r) => <span className="text-muted-foreground">{r.description ?? "—"}</span> },
    {
      key: "amount",
      header: "Сума",
      align: "right",
      sortAccessor: (r) => Number(r.amount),
      render: (r) => <span className="font-medium tabular-nums">{Number(r.amount).toFixed(2)} ₴</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Видалити витрату?")) del.mutate(r.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Витрати"
        description="Операційні витрати філії за категоріями."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Всього: <span className="font-semibold text-foreground">{total.toFixed(0)} ₴</span>
            </span>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <PrimaryButton size="sm">
                  <Plus className="mr-1.5 h-4 w-4" /> Додати витрату
                </PrimaryButton>
              </DialogTrigger>
              <ExpenseDialog
                branchId={branch.id}
                categories={(cats as any[]).filter((c) => !c.branch_id || c.branch_id === branch.id)}
                onDone={() => {
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["expenses"] });
                }}
                save={saveFn}
              />
            </Dialog>
          </div>
        }
      />
      <SectionCard>
        <DataTable
          rows={data as any[]}
          columns={columns}
          isLoading={isLoading}
          defaultSort={{ key: "spent_at", dir: "desc" }}
          emptyText="Витрат ще немає. Створіть першу через 'Додати витрату'."
        />
      </SectionCard>
    </PageContainer>
  );
}

function ExpenseDialog({
  branchId,
  categories,
  save,
  onDone,
}: {
  branchId: string;
  categories: any[];
  save: any;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    branch_id: branchId,
    category_id: "",
    amount: "",
    spent_at: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          branch_id: v.branch_id,
          category_id: v.category_id || null,
          amount: Number(v.amount),
          spent_at: v.spent_at,
          description: v.description || null,
        },
      }),
    onSuccess: () => {
      toast.success("Збережено");
      onDone();
    },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Нова витрата</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Дата</Label>
          <Input type="date" value={v.spent_at} onChange={(e) => setV({ ...v, spent_at: e.target.value })} />
        </div>
        <div>
          <Label>Категорія</Label>
          <Select value={v.category_id} onValueChange={(x) => setV({ ...v, category_id: x })}>
            <SelectTrigger>
              <SelectValue placeholder={categories.length === 0 ? "Створіть категорію в Налаштуваннях" : "Оберіть..."} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Сума, ₴</Label>
          <Input type="number" step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </div>
        <div>
          <Label>Опис</Label>
          <Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => m.mutate()} disabled={m.isPending || !v.amount || Number(v.amount) <= 0}>
          Зберегти
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
