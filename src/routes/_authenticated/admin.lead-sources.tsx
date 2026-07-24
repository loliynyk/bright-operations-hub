import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_authenticated/admin/lead-sources")({
  component: () => (
    <PlaceholderPage
      title='Джерела лідів'
      description='Керуйте джерелами лідів.'
      actionLabel='Створити джерело'
      icon={Sparkles}
    />
  ),
});
