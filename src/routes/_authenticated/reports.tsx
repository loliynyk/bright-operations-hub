import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";

export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <ModuleStub
      title="Звіти"
      description="Аналітика по всіх модулях"
      planned={[
        "Конверсія воронки лідів",
        "Завантаженість груп по філіях",
        "P&L по філіях помісячно",
        "Дашборд для власника",
      ]}
    />
  ),
});
