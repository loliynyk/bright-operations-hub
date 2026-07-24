import { Plus, type LucideIcon } from "lucide-react";
import { PageContainer, PageHeader, EmptyState, PrimaryButton } from "@/components/ds";

export function PlaceholderPage({
  title,
  description,
  emptyTitle,
  emptyDescription,
  actionLabel,
  icon,
}: {
  title: string;
  description: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actionLabel: string;
  icon: LucideIcon;
}) {
  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        actions={
          <PrimaryButton size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> {actionLabel}
          </PrimaryButton>
        }
      />
      <EmptyState
        icon={icon}
        title={emptyTitle ?? "Поки що немає даних"}
        description={emptyDescription ?? "Модуль знаходиться на етапі підготовки."}
        action={
          <PrimaryButton size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> {actionLabel}
          </PrimaryButton>
        }
      />
    </PageContainer>
  );
}
