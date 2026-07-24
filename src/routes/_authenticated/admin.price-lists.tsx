import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/price-lists")({
  component: () => (
    <PlaceholderPage
      title='Прайс-листи'
      description='Керуйте прайс-листами послуг.'
      actionLabel='Створити прайс-лист'
      icon={ListOrdered}
    />
  ),
});
