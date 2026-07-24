import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserSquare2, FileText, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [leads, newLeads, won, branches] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "won"),
        supabase.from("branches").select("*", { count: "exact", head: true }),
      ]);
      return {
        leads: leads.count ?? 0,
        newLeads: newLeads.count ?? 0,
        won: won.count ?? 0,
        branches: branches.count ?? 0,
      };
    },
  });

  const cards = [
    { title: "Усього лідів", value: stats?.leads ?? 0, icon: Users, tone: "bg-primary/10 text-primary" },
    { title: "Нові ліди", value: stats?.newLeads ?? 0, icon: TrendingUp, tone: "bg-accent/20 text-accent-foreground" },
    { title: "Клієнти", value: stats?.won ?? 0, icon: UserSquare2, tone: "bg-success/15 text-success" },
    { title: "Філії", value: stats?.branches ?? 0, icon: FileText, tone: "bg-muted text-foreground" },
  ];

  return (
    <>
      <PageHeader
        title="Дашборд"
        description="Огляд ключових операційних показників Bright Preschool"
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {c.title}
                  </CardTitle>
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${c.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{c.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ласкаво просимо до Bright OS</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Ця версія містить основу платформи: авторизацію, ролі, філії та повний модуль
              керування лідами (список і Kanban).
            </p>
            <p>
              Наступні модулі — Клієнти, Договори, Відвідуваність, Фінанси, Звіти — вже мають
              каркас і будуть підключені до бази у наступних ітераціях.
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
