import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/contract-templates")({
  component: () => (
    <PlaceholderPage
      title='Шаблони договорів'
      description='Керуйте шаблонами договорів.'
      actionLabel='Створити шаблон'
      icon={FileText}
    />
  ),
});
