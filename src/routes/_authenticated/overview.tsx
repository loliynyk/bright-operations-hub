import { createFileRoute } from "@tanstack/react-router";
import { PageContainer, PageHeader } from "@/components/ds";
import { SetupChecklist } from "@/components/overview/setup-checklist";

export const Route = createFileRoute("/_authenticated/overview")({
  component: () => (
    <PageContainer>
      <PageHeader title="Огляд бізнесу" description="Зведена аналітика та стан налаштувань." />
      <SetupChecklist />
    </PageContainer>
  ),
});
