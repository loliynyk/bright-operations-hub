import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: () => (
    <ModuleStub
      title="Відвідуваність"
      description="Щоденний облік по групах та філіях"
      planned={[
        "Табель по групах з мобільного",
        "Причини відсутності (хвороба, відпустка)",
        "Автоматичний перерахунок оплати",
        "Звіти для вихователів",
      ]}
    />
  ),
});
