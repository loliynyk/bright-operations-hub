import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/groups")({
  component: () => (
    <PlaceholderPage
      title='Групи'
      description='Керуйте групами вихованців.'
      actionLabel='Створити групу'
      icon={Users}
    />
  ),
});
