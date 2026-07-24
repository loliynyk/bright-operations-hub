import { createFileRoute } from "@tanstack/react-router";
import { Tags } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/expense-categories")({
  component: () => (
    <PlaceholderPage
      title='Категорії витрат'
      description='Керуйте категоріями витрат.'
      actionLabel='Створити категорію'
      icon={Tags}
    />
  ),
});
