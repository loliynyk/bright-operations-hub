import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";

export const Route = createFileRoute("/_authenticated/clients")({
  component: () => (
    <ModuleStub
      title="Клієнти"
      description="Активні сім'ї та вихованці"
      planned={[
        "Автоматичне створення клієнта з ліда після оформлення",
        "Профіль дитини: група, філія, контакти батьків",
        "Історія відвідуваності та фінансів",
        "Документи та довідки",
      ]}
    />
  ),
});
