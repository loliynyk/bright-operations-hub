import { createFileRoute } from "@tanstack/react-router";
import { Tags } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/income-categories")({
  component: () => (
    <PlaceholderPage
      title='Категорії доходів'
      description='Керуйте категоріями доходів.'
      actionLabel='Створити категорію'
      icon={Tags}
    />
  ),
});
