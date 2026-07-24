import { createContext, useContext, useState, type ReactNode } from "react";

export type Branch = {
  id: string;
  name: string;
  short: string;
};

export const BRANCHES: Branch[] = [
  { id: "bright-319", name: "Bright 319", short: "319" },
  { id: "bright-zv", name: "Bright ZV", short: "ZV" },
  { id: "bright-ngo", name: "Bright NGO", short: "NGO" },
];

type BranchCtx = {
  branch: Branch;
  branches: Branch[];
  setBranch: (id: string) => void;
};

const Ctx = createContext<BranchCtx | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branch, setBranchState] = useState<Branch>(BRANCHES[0]);
  const setBranch = (id: string) => {
    const b = BRANCHES.find((x) => x.id === id);
    if (b) setBranchState(b);
  };
  return <Ctx.Provider value={{ branch, branches: BRANCHES, setBranch }}>{children}</Ctx.Provider>;
}

export function useBranch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBranch must be used within BranchProvider");
  return ctx;
}
