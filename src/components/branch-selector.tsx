import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBranch } from "@/lib/branch-context";

export function BranchSelector() {
  const { branch, branches, setBranch } = useBranch();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 px-3 font-medium"
          aria-label="Обрати філію"
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{branch.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Філія
        </p>
        {branches.map((b) => {
          const active = b.id === branch.id;
          return (
            <button
              key={b.id}
              onClick={() => {
                setBranch(b.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent",
                active && "bg-accent",
              )}
            >
              <span className="font-medium">{b.name}</span>
              {active ? <Check className="h-4 w-4 text-primary" /> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
