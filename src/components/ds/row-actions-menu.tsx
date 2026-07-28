import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/**
 * Compact row actions dropdown. Stops propagation so a clickable row
 * doesn't navigate when the menu is opened / an item is selected.
 */
export function RowActionsMenu({ actions, ariaLabel = "Дії" }: { actions: RowAction[]; ariaLabel?: string }) {
  if (!actions.length) return null;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="inline-flex"
      data-stop="true"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={ariaLabel}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {actions.map((a, i) => (
            <div key={i}>
              {a.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={a.disabled}
                onSelect={(e) => {
                  e.preventDefault();
                  a.onSelect();
                }}
                className={cn(a.destructive && "text-destructive focus:text-destructive")}
              >
                {a.icon ? <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">{a.icon}</span> : null}
                {a.label}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
