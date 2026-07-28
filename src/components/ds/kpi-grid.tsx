import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive KPI tile grid. Wraps MetricCard children.
 * Use for 3–5 KPI tiles above a list.
 */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
