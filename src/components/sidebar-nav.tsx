import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "@/lib/nav";

export function SidebarNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Bright OS</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            операційна платформа
          </span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => (
          <NavRow key={item.label} item={item} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

function NavRow({
  item,
  pathname,
}: {
  item: (typeof NAV)[number];
  pathname: string;
}) {
  const hasChildren = !!item.children?.length;
  const childActive = hasChildren && item.children!.some((c) => pathname.startsWith(c.to));
  const [open, setOpen] = useState<boolean>(childActive);
  const Icon = item.icon;

  if (!hasChildren && item.to) {
    const active = pathname === item.to || pathname.startsWith(item.to + "/");
    return (
      <Link
        to={item.to}
        className={cn(
          "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          active &&
            "bg-sidebar-accent text-sidebar-foreground shadow-xs ring-1 ring-primary/10",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          childActive && "text-sidebar-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            childActive ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="ml-[26px] mt-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {item.children!.map((c) => {
            const active = pathname === c.to;
            return (
              <Link
                key={c.to}
                to={c.to}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/65 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
