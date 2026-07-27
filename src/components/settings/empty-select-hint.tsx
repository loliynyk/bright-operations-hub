import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

export function EmptySelectHint({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </Link>
  );
}
