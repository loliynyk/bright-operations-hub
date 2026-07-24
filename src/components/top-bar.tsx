import { Bell, LogOut, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BranchSelector } from "@/components/branch-selector";
import { UserAvatar } from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";

export function TopBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const palette = useCommandPalette();

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-6">
      <BranchSelector />
      <button
        onClick={() => palette.setOpen(true)}
        className="mx-2 hidden max-w-md flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent md:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Пошук у Bright OS...</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>
      <div className="flex-1 md:hidden" />
      <Button variant="ghost" size="icon" aria-label="Пошук" className="h-9 w-9 md:hidden" onClick={() => palette.setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Сповіщення" className="h-9 w-9">
        <Bell className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
            aria-label="Меню користувача"
          >
            <UserAvatar
              name={user?.user_metadata?.full_name as string | undefined}
              email={user?.email}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email ?? "Гість"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Вийти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </header>
  );
}

