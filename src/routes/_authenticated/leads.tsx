import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/leads")({
  component: () => (
    <PlaceholderPage
      title='Ліди'
      description='У цьому модулі буде управління лідами.'
      actionLabel='Створити ліда'
      icon={Users}
    />
  ),
});
