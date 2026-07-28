import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SectionCard } from "@/components/ds";
import { Sparkles, UserPlus2 } from "lucide-react";

/**
 * Section wrapper for lifecycle "related records" surfaces on Lead / Client /
 * Child detail pages. Keeps a consistent title and empty state.
 */
export function RelatedRecordsSection({
  title = "Пов'язані записи",
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard title={title} description={description} className={className}>
      <div className="space-y-2">{children}</div>
    </SectionCard>
  );
}

/**
 * Compact clickable row linking one lifecycle entity to another.
 * Wrap any child inside a stopPropagation container when embedded inside a
 * clickable row.
 */
export function EntityLink({
  to,
  params,
  search,
  icon,
  label,
  sublabel,
  right,
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  icon?: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Link
      to={to as any}
      params={params as any}
      search={search as any}
      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-muted/40"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon ? <span className="text-primary shrink-0">{icon}</span> : null}
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{label}</span>
          {sublabel ? <span className="block truncate text-xs text-muted-foreground">{sublabel}</span> : null}
        </span>
      </span>
      {right ? <span className="text-xs text-muted-foreground shrink-0">{right}</span> : null}
    </Link>
  );
}

/**
 * Small badge marking client origin: converted from a lead vs. created
 * manually. Renders as a link chip when a leadId is provided.
 */
export function OriginBadge({ leadId }: { leadId?: string | null }) {
  if (leadId) {
    return (
      <Link
        to="/leads/$id"
        params={{ id: leadId }}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/15"
        title="Відкрити оригінальний лід"
      >
        <Sparkles className="h-3 w-3" /> З ліда
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <UserPlus2 className="h-3 w-3" /> Створено вручну
    </span>
  );
}
