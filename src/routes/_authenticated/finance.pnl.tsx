import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/pnl")({
  component: () => (
    <PlaceholderPage
      title='P&L'
      description='Тут відображатиметься звіт про прибутки та збитки.'
      actionLabel='Оновити звіт'
      icon={BarChart3}
    />
  ),
});
