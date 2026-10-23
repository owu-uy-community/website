"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, UserRoundCheck, X } from "lucide-react";

import { Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { cameLabel, isFirstTime, type History } from "lib/organizar/attendance";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";

import type { EventInput } from "./save";

/**
 * Someone's history with the community, for its organizers only: "Primera vez", or "vino a 3 de 4"
 * and the late releases. Never on a public page, never to hosts.
 */
export function HistoryChips({ history }: { history: History | null | undefined }) {
  if (!history) return null;
  if (isFirstTime(history)) return <Badge variant="info">Primera vez</Badge>;
  const came = cameLabel(history);

  return (
    <>
      {came ? <Badge variant="secondary">{came}</Badge> : null}
      {history.lateReleases ? (
        <Badge variant="outline">
          liberó tarde {history.lateReleases === 1 ? "1 vez" : `${history.lateReleases} veces`}
        </Badge>
      ) : null}
    </>
  );
}

/**
 * Who waits for the team's approval: name, +1s, what they answered and their history here, with
 * Aprobar / No aprobar. Editors review from here without seeing the whole list (no emails, no CSV).
 */
export function PendingList({ input }: { input: EventInput }) {
  const queryClient = useQueryClient();
  const pending = useQuery(orpc.rsvps.pending.queryOptions({ input }));
  const review = useMutation(
    orpc.rsvps.review.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.status === "declined"
            ? "No aprobada"
            : result.status === "waitlisted"
              ? "A la lista de espera"
              : "Aprobada",
          "Le avisamos por mail."
        );
        void queryClient.invalidateQueries({ queryKey: orpc.rsvps.pending.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
      },
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );

  if (pending.isError) {
    return (
      <Panel>
        <ErrorState onRetry={() => void pending.refetch()} title="No pudimos traer quiénes esperan" />
      </Panel>
    );
  }
  if (!pending.data) return <Skeleton className="h-40 rounded-lg" />;
  if (pending.data.length === 0) {
    return (
      <Panel>
        <EmptyState
          compact
          description="Cuando alguien pida lugar, aparece acá para que lo apruebes."
          icon={UserRoundCheck}
          title="Nadie espera tu aprobación"
        />
      </Panel>
    );
  }

  return (
    <Panel aria-label="Por aprobar">
      <p className="border-b border-border px-4 py-2.5 text-meta text-muted-foreground">
        {plural(pending.data.length, "persona espera", "personas esperan")} tu aprobación. Al aprobar, si no hay lugar,
        van a la lista de espera.
      </p>
      <ul className="divide-y divide-border">
        {pending.data.map((person) => (
          <li key={person.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-ui font-medium text-foreground">
                {person.name}
                {person.guests ? <span className="text-muted-foreground">+{person.guests}</span> : null}
                <HistoryChips history={person.history} />
              </p>
              {person.registeredAt ? (
                <p className="text-meta text-muted-foreground">
                  Pidió lugar <RelativeTime className="text-meta" date={person.registeredAt} />
                </p>
              ) : null}
              {person.answers.length > 0 ? (
                <dl className="mt-2 grid gap-1 text-meta">
                  {person.answers.map((answer) => (
                    <div key={answer.label}>
                      <dt className="text-muted-foreground">{answer.label}</dt>
                      <dd className="text-foreground">{answer.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                aria-label={`No aprobar a ${person.name}`}
                disabled={review.isPending}
                size="sm"
                variant="outline"
                onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "decline" })}
              >
                <X />
                No aprobar
              </Button>
              <Button
                aria-label={`Aprobar a ${person.name}`}
                disabled={review.isPending}
                size="sm"
                variant="outline"
                onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "approve" })}
              >
                <Check />
                Aprobar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
