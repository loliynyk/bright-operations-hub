import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  component: () => (
    <PlaceholderPage
      title='Ролі'
      description='Керуйте ролями та правами доступу.'
      actionLabel='Створити роль'
      icon={ShieldCheck}
    />
  ),
});
