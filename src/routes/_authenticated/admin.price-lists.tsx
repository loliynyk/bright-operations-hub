import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListOrdered } from "lucide-react";
import { PageContainer, PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/ds";
import { listPlansWithPrices } from "@/lib/settings.functions";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_authenticated/admin/price-lists")({
  component: PriceListsPage,
});

function PriceListsPage() {
  const { branch } = useBranch();
  const fn = useServerFn(listPlansWithPrices);
  const { data } = useQuery({
    queryKey: ["plans-flat", branch.id],
    queryFn: () => fn({ data: { branchId: branch.id } }),
  });
  const planName = new Map((data?.plans ?? []).map((p: any) => [p.id, p.name]));
  const prices = data?.prices ?? [];
  return (
    <PageContainer>
      <PageHeader
        title="Прайс-листи"
        description="Огляд усіх версій цін. Редагування — у розділі «Тарифні плани»."
      />
      <SectionCard>
        {prices.length === 0 ? (
          <EmptyState icon={ListOrdered} title="Ще немає цін" description="Створіть тарифний план і додайте версію ціни." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">План</th>
                <th className="py-2 pr-4">Версія</th>
                <th className="py-2 pr-4">Ціна</th>
                <th className="py-2 pr-4">З</th>
                <th className="py-2 pr-4">До</th>
                <th className="py-2 pr-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-4">{planName.get(p.plan_id) ?? "—"}</td>
                  <td className="py-1.5 pr-4">{p.name}</td>
                  <td className="py-1.5 pr-4">{Number(p.monthly_price).toFixed(0)} ₴</td>
                  <td className="py-1.5 pr-4">{p.valid_from}</td>
                  <td className="py-1.5 pr-4">{p.valid_to ?? "—"}</td>
                  <td className="py-1.5 pr-4">
                    <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                      {p.is_active ? "Активна" : "Архів"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </PageContainer>
  );
}
