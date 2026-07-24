import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/finance/contracts")({
  component: () => (
    <PlaceholderPage
      title='Договори'
      description='У цьому модулі будуть договори з клієнтами.'
      actionLabel='Створити договір'
      icon={FileText}
    />
  ),
});
