import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | undefined;

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T, absoluteIndex: number) => ReactNode;
  /** Provide to make this header sortable. */
  sortAccessor?: (row: T) => string | number | null | undefined;
  className?: string;
  align?: "left" | "right" | "center";
};

/**
 * Consistent numbered + sortable table. Numbering continues across pages.
 * Client-side sort operates on the full row set, so numbering + sort remain
 * stable while paging.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  defaultSort,
  pageSize = 25,
  emptyText = "Немає записів",
  isLoading,
  totalLabel = "Всього",
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  defaultSort?: { key: string; dir: SortDir };
  pageSize?: number;
  emptyText?: string;
  isLoading?: boolean;
  totalLabel?: string;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortAccessor) return rows;
    const acc = col.sortAccessor;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const toggle = (key: string) => {
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: "desc" }
        : prev.dir === "desc"
          ? { key, dir: "asc" }
          : undefined,
    );
    setPage(1);
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2.5 text-right font-medium">№</th>
              {columns.map((c) => {
                const alignCls = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                const isSorted = sort?.key === c.key;
                return (
                  <th key={c.key} className={cn("px-4 py-2.5 font-medium", alignCls, c.className)}>
                    {c.sortAccessor ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                      >
                        {c.header}
                        {isSorted ? (
                          sort!.dir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-muted-foreground">
                  Завантаження…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const abs = start + i;
                return (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{abs + 1}</td>
                    {columns.map((c) => {
                      const alignCls =
                        c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                      return (
                        <td key={c.key} className={cn("px-4 py-3", alignCls, c.className)}>
                          {c.render(row, abs)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {totalLabel}: <span className="font-semibold text-foreground">{total}</span>
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              Назад
            </Button>
            <span>
              Сторінка {currentPage} з {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Далі
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Format ISO date/timestamp as dd.MM.yyyy for Ukrainian UI. */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
