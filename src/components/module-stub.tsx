import { PageHeader, PageBody } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModuleStub({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <PageBody>
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center">
              <Construction className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Модуль у розробці</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Каркас готовий, повний функціонал буде додано у наступних ітераціях.
              </p>
            </div>
            <div className="text-left w-full max-w-md bg-muted/40 rounded-lg p-4">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Заплановано
              </div>
              <ul className="text-sm space-y-1 list-disc list-inside">
                {planned.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
