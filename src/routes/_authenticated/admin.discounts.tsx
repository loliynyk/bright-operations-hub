import { createFileRoute } from "@tanstack/react-router";
import { Percent } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/discounts")({
  component: () => (
    <PlaceholderPage
      title='Знижки'
      description='Керуйте знижками та акціями.'
      actionLabel='Створити знижку'
      icon={Percent}
    />
  ),
});
