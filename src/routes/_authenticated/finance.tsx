import { createFileRoute } from "@tanstack/react-router";
import { ModuleStub } from "@/components/module-stub";

export const Route = createFileRoute("/_authenticated/finance")({
  component: () => (
    <ModuleStub
      title="Фінанси"
      description="Нарахування, оплати, витрати"
      planned={[
        "Автоматичні щомісячні нарахування за тарифом",
        "Реєстр оплат з імпортом виписки банку",
        "Витрати по філіях та категоріях",
        "Заборгованість і платіжні нагадування",
      ]}
    />
  ),
});
