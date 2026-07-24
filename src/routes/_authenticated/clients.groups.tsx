import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/clients/groups")({
  component: () => (
    <PlaceholderPage
      title='Групи клієнтів'
      description='У цьому модулі будуть групи вихованців.'
      actionLabel='Створити групу'
      icon={Users}
    />
  ),
});
