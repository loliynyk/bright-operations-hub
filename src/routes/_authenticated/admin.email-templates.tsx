import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/email-templates")({
  component: () => (
    <PlaceholderPage
      title='Шаблони листів'
      description='Керуйте шаблонами email-повідомлень.'
      actionLabel='Створити шаблон'
      icon={Mail}
    />
  ),
});
