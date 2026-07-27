import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLookups } from "@/lib/lookups.functions";

export type Branch = {
  id: string;
  name: string;
  short: string;
};

const STORAGE_KEY = "bright.selectedBranchId";

type BranchCtx = {
  branch: Branch;
  branches: Branch[];
  setBranch: (id: string) => void;
  isLoading: boolean;
};

const Ctx = createContext<BranchCtx | null>(null);

function shortLabel(name: string): string {
  const parts = name.split(/[\s—–-]+/).filter(Boolean);
  const tail = parts[parts.length - 1] ?? name;
  return tail.slice(0, 6);
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const lookupsFn = useServerFn(listLookups);
  const { data, isLoading } = useQuery({
    queryKey: ["lookups"],
    queryFn: () => lookupsFn(),
    staleTime: 5 * 60_000,
  });

  const branches = useMemo<Branch[]>(() => {
    const rows = (data?.branches ?? []) as Array<{ id: string; name: string }>;
    return rows.map((b) => ({ id: b.id, name: b.name, short: shortLabel(b.name) }));
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  // Ensure a valid selection once branches load.
  useEffect(() => {
    if (branches.length === 0) return;
    if (!selectedId || !branches.some((b) => b.id === selectedId)) {
      const next = branches[0].id;
      setSelectedId(next);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, [branches, selectedId]);

  const setBranch = (id: string) => {
    if (!branches.some((b) => b.id === id)) return;
    setSelectedId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  };

  const branch: Branch =
    branches.find((b) => b.id === selectedId) ??
    branches[0] ??
    // Placeholder until server response arrives; guarded by isLoading.
    { id: "", name: "Завантаження…", short: "…" };

  return (
    <Ctx.Provider value={{ branch, branches, setBranch, isLoading: isLoading || branches.length === 0 }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
