import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmation dialog for destructive actions. Always names the entity
 * and briefly explains the impact. Prefer archive over hard delete.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  entityName,
  impact,
  actionLabel = "Видалити",
  variant = "delete",
  onConfirm,
  isPending,
  extra,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityName: string;
  impact?: string;
  actionLabel?: string;
  variant?: "delete" | "archive" | "restore";
  onConfirm: () => void;
  isPending?: boolean;
  extra?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const title =
    variant === "archive"
      ? "Архівувати"
      : variant === "restore"
        ? "Відновити"
        : "Видалити";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title}: <span className="font-semibold">{entityName}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {impact ?? (variant === "delete"
              ? "Дію не можна буде скасувати."
              : variant === "archive"
                ? "Запис буде приховано зі списків. Історичні дані збережуться."
                : "Запис знову стане активним.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {extra ? <div className="text-sm">{extra}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending || confirming}>Скасувати</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || confirming}
            onClick={async (e) => {
              e.preventDefault();
              setConfirming(true);
              try {
                await onConfirm();
              } finally {
                setConfirming(false);
              }
            }}
            className={variant === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
