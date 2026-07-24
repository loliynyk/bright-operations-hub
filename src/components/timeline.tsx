import { TIMELINE_LABELS } from "@/lib/leads";
import { formatDistanceToNow } from "date-fns";
import { uk } from "date-fns/locale";

type Event = {
  id: string;
  type: string;
  payload: any;
  created_at: string;
};

export function Timeline({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Ще немає подій.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-foreground">
              {TIMELINE_LABELS[e.type] ?? e.type}
            </p>
            <time className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: uk })}
            </time>
          </div>
          {e.payload && Object.keys(e.payload).length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatPayload(e.type, e.payload)}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function formatPayload(type: string, p: any): string {
  if (type === "status_changed") return `${p.from ?? "—"} → ${p.to ?? "—"}`;
  if (type === "charges_generated") return `${p.count ?? 0} нарахувань`;
  if (type === "contract_generated") return p.number ? `№ ${p.number}` : "";
  return "";
}
