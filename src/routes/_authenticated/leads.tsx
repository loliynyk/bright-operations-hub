import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Phone, Mail } from "lucide-react";
import { LEAD_STATUSES, LEAD_SOURCES, statusLabel, statusTone, sourceLabel, type LeadStatus } from "@/lib/leads";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

interface Lead {
  id: string;
  branch_id: string | null;
  parent_name: string;
  parent_phone: string | null;
  parent_email: string | null;
  child_name: string | null;
  child_birthdate: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  created_at: string;
}

function LeadsPage() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const qc = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e: Error) => toast.error("Не вдалося оновити", { description: e.message }),
  });

  const filtered = leads.filter((l) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      l.parent_name.toLowerCase().includes(q) ||
      (l.child_name ?? "").toLowerCase().includes(q) ||
      (l.parent_phone ?? "").includes(q) ||
      (l.parent_email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Ліди"
        description="Воронка потенційних клієнтів Bright Preschool"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Новий лід
              </Button>
            </DialogTrigger>
            <NewLeadDialog onDone={() => setOpen(false)} />
          </Dialog>
        }
      />
      <PageBody>
        <Tabs defaultValue="kanban">
          <div className="flex items-center justify-between gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
              <TabsTrigger value="list">Список</TabsTrigger>
            </TabsList>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Пошук за ім'ям, телефоном…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value="kanban" className="mt-0">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Завантаження…</div>
            ) : (
              <div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto pb-4">
                {LEAD_STATUSES.map((s) => {
                  const items = filtered.filter((l) => l.status === s.value);
                  return (
                    <div key={s.value} className="flex flex-col min-h-[400px]">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", s.tone)}>
                            {s.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{items.length}</span>
                        </div>
                      </div>
                      <div className="space-y-2 flex-1">
                        {items.map((l) => (
                          <Card key={l.id} className="p-3 hover:shadow-md transition-shadow">
                            <div className="font-medium text-sm">{l.parent_name}</div>
                            {l.child_name && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Дитина: {l.child_name}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {l.parent_phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {l.parent_phone}
                                </span>
                              )}
                            </div>
                            <div className="mt-3">
                              <Select
                                value={l.status}
                                onValueChange={(v) =>
                                  updateStatus.mutate({ id: l.id, status: v as LeadStatus })
                                }
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {LEAD_STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </Card>
                        ))}
                        {items.length === 0 && (
                          <div className="text-xs text-muted-foreground/60 text-center py-6 border border-dashed rounded-md">
                            Порожньо
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-0">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Батько/матір</TableHead>
                    <TableHead>Дитина</TableHead>
                    <TableHead>Контакти</TableHead>
                    <TableHead>Джерело</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.parent_name}</TableCell>
                      <TableCell>{l.child_name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          {l.parent_phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {l.parent_phone}
                            </span>
                          )}
                          {l.parent_email && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {l.parent_email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{sourceLabel(l.source)}</TableCell>
                      <TableCell>
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusTone(l.status))}>
                          {statusLabel(l.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        Лідів ще немає. Створіть перший.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

function NewLeadDialog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    child_name: "",
    source: "",
    notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").insert({
        parent_name: form.parent_name,
        parent_phone: form.parent_phone || null,
        parent_email: form.parent_email || null,
        child_name: form.child_name || null,
        source: (form.source || null) as never,
        notes: form.notes || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Лід створено");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onDone();
    },
    onError: (e: Error) => toast.error("Не вдалося створити", { description: e.message }),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Новий лід</DialogTitle>
        <DialogDescription>Додайте потенційного клієнта у воронку</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label>ПІБ батька/матері *</Label>
          <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Телефон</Label>
            <Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Ім'я дитини</Label>
            <Input value={form.child_name} onChange={(e) => setForm({ ...form, child_name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Джерело</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Оберіть…" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Примітки</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => create.mutate()}
          disabled={!form.parent_name || create.isPending}
        >
          {create.isPending ? "Створення…" : "Створити"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
