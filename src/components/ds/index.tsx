import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, type LucideIcon } from "lucide-react";
import { useBranch } from "@/lib/branch-context";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { branch } = useBranch();
  return (
    <div className="mb-8 flex flex-col gap-4 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {branch.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
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
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow",
        className,
      )}
    >
      {title ? (
        <header className="mb-5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type MetricTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
const metricToneClass: Record<MetricTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  danger: "bg-destructive/12 text-destructive",
  info: "bg-info/12 text-info",
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
}) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-150 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              metricToneClass[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function DataTablePlaceholder({ columns = ["—", "—", "—", "—"] }: { columns?: string[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {columns.map((c, i) => (
          <div key={i}>{c}</div>
        ))}
      </div>
      <div className="p-10 text-center text-sm text-muted-foreground">
        Тут з'явиться таблиця даних.
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
export function StatusBadge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  const toneClass: Record<StatusTone, string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success/12 text-success",
    warning: "bg-warning/18 text-foreground/80",
    danger: "bg-destructive/12 text-destructive",
    info: "bg-primary/10 text-primary",
  };
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", toneClass[tone])}>
      {children}
    </Badge>
  );
}

export function PrimaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}

export function SecondaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="outline" {...props} />;
}

export function SearchInput({
  placeholder = "Пошук...",
  className,
  ...rest
}: React.ComponentProps<typeof Input>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="h-10 pl-9"
        {...rest}
      />
    </div>
  );
}

export function UserAvatar({ name, email }: { name?: string | null; email?: string | null }) {
  const initials = (name || email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Avatar className="h-8 w-8 ring-2 ring-background">
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
