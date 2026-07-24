import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/expenses")({
  component: () => (
    <PlaceholderPage
      title='Витрати'
      description='У цьому модулі будуть операційні витрати.'
      actionLabel='Додати витрату'
      icon={Wallet}
    />
  ),
});
