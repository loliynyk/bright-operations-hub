import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/subscription-plans")({
  component: () => (
    <PlaceholderPage
      title='Тарифні плани'
      description='Керуйте тарифними планами.'
      actionLabel='Створити план'
      icon={Package}
    />
  ),
});
