import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: () => (
    <PlaceholderPage
      title='Користувачі'
      description='Керуйте користувачами системи.'
      actionLabel='Додати користувача'
      icon={Users}
    />
  ),
});
