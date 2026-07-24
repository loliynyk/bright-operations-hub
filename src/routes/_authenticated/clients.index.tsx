import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserSquare2 } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, EmptyState, SearchInput } from "@/components/ds";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsIndex,
});

function ClientsIndex() {
  const listFn = useServerFn(listClients);
  const { data: clients = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const filtered = clients.filter((c: any) => {
    if (!q) return true;
    return `${c.parent_first_name} ${c.parent_last_name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <PageContainer>
      <PageHeader title="Клієнти" description="Батьки, з якими укладено співпрацю." />
      <SectionCard>
        <div className="mb-4"><SearchInput value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" /></div>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Завантаження...</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserSquare2} title="Ще немає клієнтів" description="Клієнти з'являються після конвертації лідів." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Клієнт</th>
                  <th className="px-4 py-2.5 text-left font-medium">Телефон</th>
                  <th className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th className="px-4 py-2.5 text-left font-medium">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to="/clients/$id" params={{ id: c.id }} className="font-medium text-foreground hover:underline">
                        {c.parent_first_name} {c.parent_last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
