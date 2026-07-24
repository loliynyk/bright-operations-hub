import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: () => (
    <PlaceholderPage
      title='Оплати'
      description='У цьому модулі будуть оплати від клієнтів.'
      actionLabel='Додати оплату'
      icon={CreditCard}
    />
  ),
});
