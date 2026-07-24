import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/cash-flow")({
  component: () => (
    <PlaceholderPage
      title='Cash Flow'
      description='Тут відображатиметься рух грошових коштів.'
      actionLabel='Оновити звіт'
      icon={TrendingUp}
    />
  ),
});
