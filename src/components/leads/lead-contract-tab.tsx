import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSignature, Loader2, Lock, Mail, Upload } from "lucide-react";
import { SectionCard, PrimaryButton, SecondaryButton, StatusBadge } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  attachLeadContractFile,
  finalizeLeadContract,
  getLeadContractFileUrl,
  recordLeadContractSent,
  recordLeadContractSigned,
  upsertLeadContract,
} from "@/lib/lead-admissions.functions";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function LeadContractTab({
  leadId,
  lead,
  contract,
  files,
  privileged,
  readOnly,
  onChanged,
}: {
  leadId: string;
  lead: any;
  contract: any | null;
  files: any[];
  privileged: boolean;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const upsertFn = useServerFn(upsertLeadContract);
  const attachFn = useServerFn(attachLeadContractFile);
  const finalizeFn = useServerFn(finalizeLeadContract);
  const urlFn = useServerFn(getLeadContractFileUrl);
  const sentFn = useServerFn(recordLeadContractSent);
  const signFn = useServerFn(recordLeadContractSigned);

  const [meta, setMeta] = useState({ number: contract?.number ?? "", contract_date: contract?.contract_date ?? "" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  const saveMeta = useMutation({
    mutationFn: () => upsertFn({ data: { lead_id: leadId, number: meta.number || null, contract_date: meta.contract_date || null } }),
    onSuccess: () => { toast.success("Збережено"); onChanged(); },
    onError: (e: any) => toast.error("Помилка", { description: e.message }),
  });

  const finalize = useMutation({
    mutationFn: () => finalizeFn({ data: { lead_id: leadId } }),
    onSuccess: () => { toast.success("Договір фіналізовано"); onChanged(); },
    onError: (e: any) => toast.error("Не вдалося фіналізувати", { description: e.message }),
  });

  if (!privileged) {
    return (
      <SectionCard title="Договір">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Договори доступні лише адміністратору та менеджеру.
        </div>
      </SectionCard>
    );
  }

  async function upload(kind: "draft" | "final" | "signed", file: File) {
    setUploading(kind);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${leadId}/${kind}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("lead-contracts").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      await attachFn({
        data: { lead_id: leadId, kind, path, filename: file.name, mime: file.type, size: file.size },
      });
      toast.success("Файл прикріплено");
      onChanged();
    } catch (e: any) {
      toast.error("Помилка завантаження", { description: e.message });
    } finally {
      setUploading(null);
    }
  }

  async function openFile(path: string) {
    try {
      const res = await urlFn({ data: { path } });
      if (res?.url) window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error("Не вдалося відкрити файл", { description: e.message });
    }
  }

  const isFinal = contract?.status === "final";

  return (
    <div className="space-y-4">
      <SectionCard
        title="Картка договору"
        description="Договір готується поза системою (.docx / .pdf) і прикріплюється сюди. Система нічого не генерує автоматично."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Номер договору</Label>
            <Input disabled={readOnly || isFinal} value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Дата договору</Label>
            <Input disabled={readOnly || isFinal} type="date" value={meta.contract_date ?? ""} onChange={(e) => setMeta({ ...meta, contract_date: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Статус</Label>
            <div className="pt-2">
              {contract ? (
                isFinal ? <StatusBadge tone="success">Фінальний</StatusBadge> : <StatusBadge tone="warning">Чернетка</StatusBadge>
              ) : (
                <span className="text-sm text-muted-foreground">Ще не створено</span>
              )}
            </div>
          </div>
        </div>
        {readOnly || isFinal ? null : (
          <div className="mt-4 flex justify-end">
            <SecondaryButton onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>
              {contract ? "Зберегти" : "Створити картку договору"}
            </SecondaryButton>
          </div>
        )}
      </SectionCard>

      {contract ? (
        <SectionCard title="Файли договору" description="Дозволені формати: .pdf та .docx (до 25 МБ).">
          <div className="space-y-3">
            <FileRow
              label="Чернетка"
              filename={contract.draft_filename}
              onOpen={contract.draft_path ? () => openFile(contract.draft_path) : undefined}
              onUpload={readOnly || isFinal ? undefined : (f) => upload("draft", f)}
              busy={uploading === "draft"}
            />
            <FileRow
              label="Фінальна версія"
              filename={contract.final_filename}
              onOpen={contract.final_path ? () => openFile(contract.final_path) : undefined}
              onUpload={readOnly ? undefined : (f) => upload("final", f)}
              busy={uploading === "final"}
            />
            <FileRow
              label="Підписаний скан"
              filename={contract.signed_filename}
              onOpen={contract.signed_path ? () => openFile(contract.signed_path) : undefined}
              onUpload={readOnly ? undefined : (f) => upload("signed", f)}
              busy={uploading === "signed"}
            />
          </div>

          {files.length > 1 ? (
            <div className="mt-4 rounded-lg bg-muted/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Історія версій</p>
              <ul className="space-y-1 text-xs">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <button className="truncate text-left underline-offset-2 hover:underline" onClick={() => openFile(f.path)}>
                      {f.filename}
                    </button>
                    <span className="shrink-0 text-muted-foreground">
                      {f.kind} · {new Date(f.created_at).toLocaleString("uk-UA")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!readOnly ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {!isFinal ? (
                <PrimaryButton onClick={() => finalize.mutate()} disabled={finalize.isPending}>
                  {finalize.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Фіналізувати договір
                </PrimaryButton>
              ) : (
                <>
                  <SecondaryButton onClick={() => setEmailOpen(true)}>
                    <Mail className="mr-2 h-4 w-4" /> Надіслати клієнту
                  </SecondaryButton>
                  <PrimaryButton onClick={() => setSignOpen(true)}>
                    <FileSignature className="mr-2 h-4 w-4" /> Зафіксувати підписання
                  </PrimaryButton>
                </>
              )}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {contract ? (
        <SectionCard title="Журнал договору">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Прикріплено" value={contract.uploaded_at ? new Date(contract.uploaded_at).toLocaleString("uk-UA") : "—"} />
            <Row label="Фіналізовано" value={contract.finalized_at ? new Date(contract.finalized_at).toLocaleString("uk-UA") : "—"} />
            <Row label="Надіслано" value={contract.sent_at ? `${new Date(contract.sent_at).toLocaleString("uk-UA")} → ${contract.sent_to_email}` : "—"} />
            <Row label="Дата підписання" value={contract.signed_date ?? "—"} />
          </dl>
        </SectionCard>
      ) : null}

      {emailOpen ? (
        <EmailDialog
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultEmail={lead?.parent_email ?? ""}
          defaultSubject={`Договір ${contract?.number ?? ""}`.trim()}
          defaultBody={`Доброго дня, ${lead?.parent_first_name ?? ""}!\n\nНадсилаємо договір${contract?.number ? ` № ${contract.number}` : ""} для ознайомлення та підписання.\n\nЗ повагою,\nBright OS`}
          onSubmit={async (v) => {
            await sentFn({ data: { lead_id: leadId, to_email: v.email, subject: v.subject, body: v.body } });
            toast.success("Надсилання зафіксовано");
            setEmailOpen(false);
            onChanged();
          }}
        />
      ) : null}

      {signOpen ? (
        <SignDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          onSubmit={async (v) => {
            await signFn({ data: { lead_id: leadId, signed_date: v.date, is_physical: v.physical, comment: v.comment || null } });
            toast.success("Підписання зафіксовано");
            setSignOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FileRow({
  label,
  filename,
  onOpen,
  onUpload,
  busy,
}: {
  label: string;
  filename?: string | null;
  onOpen?: () => void;
  onUpload?: (f: File) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{filename ?? "файл не прикріплено"}</p>
      </div>
      <div className="flex items-center gap-2">
        {onOpen ? (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <Download className="mr-1.5 h-4 w-4" /> Відкрити
          </Button>
        ) : null}
        {onUpload ? (
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Завантажити
            <input
              type="file" className="hidden" accept={ACCEPT}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function EmailDialog({
  open, onOpenChange, defaultEmail, defaultSubject, defaultBody, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultEmail: string;
  defaultSubject: string;
  defaultBody: string;
  onSubmit: (v: { email: string; subject: string; body: string }) => Promise<void>;
}) {
  const [v, setV] = useState({ email: defaultEmail, subject: defaultSubject, body: defaultBody });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Перевірка листа перед надсиланням</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Отримувач</Label>
            <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Тема</Label>
            <Input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Текст листа</Label>
            <Textarea rows={7} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Автоматичне надсилання листів вимкнено, поки не налаштовано поштовий домен. Система фіксує факт надсилання в
            історії — надішліть файл клієнту зі своєї пошти.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button>
          <PrimaryButton
            disabled={busy || !v.email || !v.subject || !v.body}
            onClick={async () => { setBusy(true); try { await onSubmit(v); } catch (e: any) { toast.error("Помилка", { description: e.message }); } finally { setBusy(false); } }}
          >
            Зафіксувати надсилання
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (v: { date: string; physical: boolean; comment: string }) => Promise<void>;
}) {
  const [v, setV] = useState({ date: new Date().toISOString().slice(0, 10), physical: false, comment: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Фіксація підписання</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Дата підписання *</Label>
            <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={v.physical} onCheckedChange={(c) => setV({ ...v, physical: c })} />
            <span className="text-sm text-muted-foreground">Підписано паперово в офісі</span>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Коментар</Label>
            <Textarea rows={3} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Скасувати</Button>
          <PrimaryButton
            disabled={busy || !v.date}
            onClick={async () => { setBusy(true); try { await onSubmit(v); } catch (e: any) { toast.error("Помилка", { description: e.message }); } finally { setBusy(false); } }}
          >
            Зберегти
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
