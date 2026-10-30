"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Skeleton } from "components/shared/ui/skeleton";
import { NumbersView } from "components/organizar/insights/NumbersView";
import { orpc } from "lib/orpc/client";
import type { Insights } from "lib/orpc/insights/schemas";

const HEALTH: Record<Insights["health"], { label: string; tone: "success" | "warning" | "destructive" | "secondary" }> =
  {
    activa: { label: "Activa", tone: "success" },
    "en-riesgo": { label: "En riesgo", tone: "warning" },
    dormida: { label: "Dormida", tone: "destructive" },
    "en-pausa": { label: "En pausa", tone: "secondary" },
  };

/** OWU as a whole (a first-timer is new to any OWU event) and every community at a glance. */
export function OwuNumbersClient() {
  const numbers = useQuery(orpc.insights.owu.queryOptions());

  return (
    <PageContainer>
      <PageHeader
        description="Todas las comunidades juntas: una persona nueva es nueva en cualquier evento de OWU. Solo números, nunca quién."
        title="Números de OWU"
      />
      {numbers.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : numbers.isError ? (
        <ErrorState retrying={numbers.isFetching} onRetry={() => void numbers.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <NumbersView numbers={numbers.data.owu} />
          <Panel>
            <PanelHead
              actions={
                <Link
                  className="text-meta text-muted-foreground underline-offset-4 hover:underline"
                  href="/admin/una-mano"
                >
                  Las que necesitan una mano
                </Link>
              }
              icon={Building2}
              meta={String(numbers.data.communities.length)}
              title="Por comunidad"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-ui">
                <thead className="text-meta text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Comunidad
                    </th>
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Último evento
                    </th>
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Eventos en 12 meses
                    </th>
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Vinieron
                    </th>
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Segunda visita
                    </th>
                    <th className="px-3.5 py-2 font-medium" scope="col">
                      Organizan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {numbers.data.communities.map((community) => (
                    <tr key={community.id} className="border-b border-border last:border-0">
                      <th className="px-3.5 py-2.5 font-normal" scope="row">
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            className="text-foreground underline-offset-4 hover:underline"
                            href={`/admin/communities/${community.slug}`}
                          >
                            {community.name}
                          </Link>
                          <Badge variant={HEALTH[community.health].tone}>{HEALTH[community.health].label}</Badge>
                          {community.publicStats ? <Badge variant="outline">Pública</Badge> : null}
                        </span>
                      </th>
                      <td className="px-3.5 py-2.5 text-muted-foreground tabular-nums">
                        {community.daysSinceLastEvent === null ? "—" : `Hace ${community.daysSinceLastEvent} d`}
                      </td>
                      <td className="px-3.5 py-2.5 tabular-nums">{community.events12m}</td>
                      <td className="px-3.5 py-2.5 tabular-nums">{community.came12m}</td>
                      <td className="px-3.5 py-2.5 tabular-nums">
                        {`${community.secondVisit.returned} de ${community.secondVisit.firstTimers}`}
                      </td>
                      <td className="px-3.5 py-2.5 tabular-nums">
                        {`${community.organizers.active} de ${community.organizers.total}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </PageContainer>
  );
}
