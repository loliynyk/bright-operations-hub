import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/branches")({
  component: () => (
    <PlaceholderPage
      title='Філії'
      description='Керуйте філіями вашої мережі.'
      actionLabel='Додати філію'
      icon={Building2}
    />
  ),
});
