import { createFileRoute } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/charges")({
  component: () => (
    <PlaceholderPage
      title='Нарахування'
      description='У цьому модулі будуть нарахування за навчання.'
      actionLabel='Створити нарахування'
      icon={ReceiptText}
    />
  ),
});
