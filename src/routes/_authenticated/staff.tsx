import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/staff")({
  component: () => (
    <PlaceholderPage
      title='Працівники'
      description='У цьому модулі буде управління персоналом.'
      actionLabel='Додати працівника'
      icon={GraduationCap}
    />
  ),
});
