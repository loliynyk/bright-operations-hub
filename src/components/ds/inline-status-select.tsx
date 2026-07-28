import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type InlineOption = { value: string; label: string };

/**
 * Optimistic inline Select for high-value fields (status, group…).
 * - stops row-click propagation
 * - shows loading state
 * - rolls back on failure
 */
export function InlineStatusSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  value: string | null;
  options: InlineOption[];
  onChange: (next: string) => Promise<unknown>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = useState<string | null>(value);
  const [pending, setPending] = useState(false);

  // Sync incoming prop when parent refetches.
  if (!pending && value !== local) {
    // best-effort external sync
    setTimeout(() => setLocal(value), 0);
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      data-stop="true"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <Select
        value={local ?? ""}
        disabled={disabled || pending}
        onValueChange={async (next) => {
          const prev = local;
          setLocal(next);
          setPending(true);
          try {
            await onChange(next);
          } catch (e: any) {
            setLocal(prev);
            toast.error("Не вдалося оновити", { description: e?.message });
          } finally {
            setPending(false);
          }
        }}
      >
        <SelectTrigger className="h-8 min-w-32 border-dashed text-xs" aria-label={ariaLabel}>
          <SelectValue placeholder={placeholder ?? "—"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
