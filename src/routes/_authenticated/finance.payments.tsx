import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  beforeLoad: () => {
    throw redirect({ to: "/finance/settlements", search: { tab: "payments" } });
  },
});
