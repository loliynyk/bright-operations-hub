import { createFileRoute } from "@tanstack/react-router";
import { UserSquare2 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/clients")({
  component: () => (
    <PlaceholderPage
      title='Клієнти'
      description='У цьому модулі буде управління клієнтами.'
      actionLabel='Додати клієнта'
      icon={UserSquare2}
    />
  ),
});
