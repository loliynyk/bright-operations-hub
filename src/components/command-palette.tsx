import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { globalSearch, type SearchResult } from "@/lib/search.functions";

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  lead: "Ліди",
  client: "Клієнти",
  child: "Діти",
  group: "Групи",
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const search = useServerFn(globalSearch);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults(await search({ data: { q } })); } catch { setResults([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, search]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Пошук: ліди, клієнти, діти, групи..." value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q ? "Нічого не знайдено" : "Почніть вводити для пошуку"}</CommandEmpty>
        {(Object.keys(grouped) as SearchResult["kind"][]).map((kind, idx) => (
          <div key={kind}>
            {idx > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={KIND_LABEL[kind]}>
              {grouped[kind].map((r) => (
                <CommandItem
                  key={`${r.kind}-${r.id}`}
                  value={`${r.kind}-${r.id}-${r.title}`}
                  onSelect={() => { onOpenChange(false); navigate({ to: r.href }); }}
                >
                  <div className="flex flex-col">
                    <span>{r.title}</span>
                    {r.subtitle ? <span className="text-xs text-muted-foreground">{r.subtitle}</span> : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
