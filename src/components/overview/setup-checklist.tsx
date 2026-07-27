import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { getSetupReadiness } from "@/lib/settings.functions";
import { useBranch } from "@/lib/branch-context";

const ITEMS: Array<{ key: keyof Awaited<ReturnType<typeof getSetupReadiness>>; label: string; to: string }> = [
  { key: "branch", label: "Створено філію", to: "/admin/branches" },
  { key: "groups", label: "Хоча б одна активна група", to: "/admin/groups" },
  { key: "services", label: "Хоча б одна активна послуга", to: "/admin/services" },
  { key: "plansWithPrice", label: "План з чинною версією ціни", to: "/admin/subscription-plans" },
  { key: "paymentMethods", label: "Активний метод оплати", to: "/admin/payment-methods" },
  { key: "expenseCategories", label: "Активна категорія витрат", to: "/admin/expense-categories" },
];

export function SetupChecklist() {
  const { branch } = useBranch();
  const fn = useServerFn(getSetupReadiness);
  const { data } = useQuery({
    queryKey: ["setup-readiness", branch.id],
    queryFn: () => fn({ data: { branchId: branch.id } }),
  });
  if (!data) return null;
  const complete = ITEMS.every((i) => data[i.key]);
  return (
    <SectionCard
      title="Готовність до роботи"
      description={complete ? "Усі базові налаштування виконані." : "Заповніть базові довідники, щоб форми клієнтів і фінансів працювали."}
      className="mb-6"
    >
      <ul className="space-y-2">
        {ITEMS.map((item) => {
          const ok = !!data[item.key];
          return (
            <li key={item.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {ok ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted-foreground" />}
                <span className={ok ? "text-muted-foreground line-through" : "text-foreground"}>{item.label}</span>
              </span>
              {!ok ? (
                <Link to={item.to} className="text-xs text-primary hover:underline">Налаштувати →</Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
