import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Compact filter bar wrapper. Renders children horizontally with wrap.
 */
export function FilterBar({
  children,
  right,
  onReset,
  hasActive,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  onReset?: () => void;
  hasActive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {right}
      {onReset && hasActive ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9 gap-1 text-xs">
          <X className="h-3.5 w-3.5" /> Скинути
        </Button>
      ) : null}
    </div>
  );
}

export type ActiveFilterChip = { key: string; label: string; onRemove: () => void };

export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <Badge
          key={c.key}
          variant="secondary"
          className="gap-1 rounded-full pl-2.5 pr-1 text-xs font-medium"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-background/60"
            aria-label={`Прибрати фільтр ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
