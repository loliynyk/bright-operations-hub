import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { SetupChecklist } from "@/components/overview/setup-checklist";
import { OverviewDashboard } from "@/components/overview/dashboard";
import { getSetupReadiness } from "@/lib/settings.functions";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_authenticated/overview")({
  component: OverviewPage,
  head: () => ({
    meta: [
      { title: "Огляд бізнесу — Bright OS" },
      { name: "description", content: "Зведений дашборд по філії: клієнти, діти, ліди, фінанси." },
    ],
  }),
});

function OverviewPage() {
  const { branch } = useBranch();
  const fn = useServerFn(getSetupReadiness);
  const { data: readiness } = useQuery({
    queryKey: ["setup-readiness", branch.id],
    queryFn: () => fn({ data: { branchId: branch.id } }),
    enabled: !!branch.id,
  });
  const complete = readiness
    ? Object.values(readiness).every(Boolean)
    : false;
  const [showSetup, setShowSetup] = useState(false);

  return (
    <PageContainer>
      <PageHeader title="Огляд бізнесу" description="Зведена аналітика по обраній філії." />
      {!readiness ? null : !complete ? (
        <>
          <SetupChecklist />
          <OverviewDashboard />
        </>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowSetup((v) => !v)}>
              {showSetup ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
              Прогрес налаштування
            </Button>
          </div>
          {showSetup ? <SetupChecklist /> : null}
          <OverviewDashboard />
        </>
      )}
    </PageContainer>
  );
}
