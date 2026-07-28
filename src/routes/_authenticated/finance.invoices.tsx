import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/finance/invoices")({
  beforeLoad: () => {
    throw redirect({ to: "/finance/settlements", search: { tab: "invoices" } });
  },
});
