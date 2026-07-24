import type { ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { BranchProvider } from "@/lib/branch-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <BranchProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </BranchProvider>
  );
}
