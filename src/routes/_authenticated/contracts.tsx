import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: () => (
    <ModuleStub
      title="Договори"
      description="Договори з батьками, тарифи, продовження"
      planned={[
        "Шаблони договорів для кожної філії",
        "Автогенерація PDF з даних клієнта",
        "Статуси: чернетка, підписаний, активний, розірваний",
        "Нагадування про продовження",
      ]}
    />
  ),
});
