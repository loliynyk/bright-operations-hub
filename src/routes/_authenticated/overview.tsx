import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/overview")({
  component: () => (
    <PlaceholderPage
      title='Огляд бізнесу'
      description='У цьому модулі буде зведена аналітика по вашій мережі садків.'
      actionLabel='Створити віджет'
      icon={LayoutDashboard}
    />
  ),
});
