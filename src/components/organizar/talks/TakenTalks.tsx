"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check, Copy, Inbox, Mail, Undo2 } from "lucide-react";

import { Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { copyText } from "components/shared/ui/copy-text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { client, orpc } from "lib/orpc/client";
import type { OrganizerEvent } from "lib/orpc/events/schemas";
import type { Claim } from "lib/orpc/talks/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { usePanel } from "../shell/context";
import { CardHead, CardLink, SpeakerBlock, TalkFacts } from "./parts";

/** The talks this community took: who to write to, which event they go to, and their share cards. */
export function TakenTalks({ community }: { community: CalendarCommunity }) {
  const input = { communityId: community.id };
  const claims = useQuery(orpc.talks.claimedFor.queryOptions({ input }));
  const events = useQuery({
    ...orpc.events.list.queryOptions({ input }),
    // Where a talk can go: drafts and published events that haven't happened
    select: (all) =>
      all.filter(
        (event) =>
          (event.status === "draft" || event.status === "published") && Date.parse(event.startDate) > Date.now()
      ),
  });

  if (claims.isError)
    return <ErrorState onRetry={() => void claims.refetch()} title="No pudimos traer las charlas tomadas" />;
  if (!claims.data) return <Skeleton className="h-44 rounded-lg" />;
  if (claims.data.length === 0) {
    return (
      <Panel>
        <EmptyState
          description="Cuando tomen una propuesta, aparece acá con el email de quien la da para coordinar."
          icon={Inbox}
          title="Todavía no tomaron ninguna"
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {claims.data.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} community={community} events={events.data} />
      ))}
    </div>
  );
}

const STATUS = {
  claimed: { label: "Sin fecha", variant: "warning" },
  scheduled: { label: "Con fecha", variant: "success" },
  given: { label: "Se dio", variant: "secondary" },
} as const;

function ClaimCard({
  claim,
  community,
  events,
}: {
  claim: Claim;
  community: CalendarCommunity;
  events: OrganizerEvent[] | undefined;
}) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const acts = can("talk:claim");
  const input = { communityId: community.id, claimId: claim.id };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.talks.key() });
  const assign = useMutation(
    orpc.talks.assign.mutationOptions({
      onSuccess: (saved) => {
        toast.success(
          "Charla en el evento",
          `Sale en ${saved.event?.name ?? "el evento"} y le avisamos a ${claim.speakerName}.`
        );
        refresh();
      },
    })
  );
  const release = useMutation(
    orpc.talks.release.mutationOptions({
      onSuccess: (released) => {
        refresh();
        // The card is gone by then: undo with the plain client, not this card's hooks
        toast.undo(`Soltaste «${claim.title}»`, () => {
          void (async () => {
            const again = await client.talks.claim({ communityId: community.id, proposalId: released.proposalId });
            if (released.eventId) {
              await client.talks.assign({ communityId: community.id, claimId: again.id, eventId: released.eventId });
            }
          })()
            .catch((error: Error) => toast.error("No se pudo deshacer", error.message))
            .finally(refresh);
        });
      },
    })
  );
  const given = useMutation(orpc.talks.given.mutationOptions({ onSuccess: refresh }));
  const failed = assign.error ?? release.error ?? given.error;
  const past = claim.event ? Date.parse(claim.event.startDate) <= Date.now() : false;
  const status = STATUS[claim.status];
  const choices = (events ?? []).filter((event) => event.id !== claim.event?.id);

  return (
    <Panel>
      <CardHead
        badge={<Badge variant={status.variant}>{status.label}</Badge>}
        meta={claim.claimedBy ? `La tomó ${claim.claimedBy}` : undefined}
        title={claim.title}
      />
      <div className="flex flex-col gap-3 p-4">
        <TalkFacts talk={claim} />
        <p className="line-clamp-4 text-ui whitespace-pre-line text-subtle">{claim.abstract}</p>
        <SpeakerBlock name={claim.speakerName} speaker={claim.speaker} />
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <Mail aria-hidden className="size-3.5 text-muted-foreground" />
          <a className="text-foreground underline-offset-2 hover:underline" href={`mailto:${claim.speakerEmail}`}>
            {claim.speakerEmail}
          </a>
          <Button
            aria-label={`Copiar el email de ${claim.speakerName}`}
            size="icon-sm"
            variant="ghost"
            onClick={() => void copyText(claim.speakerEmail, "Email copiado")}
          >
            <Copy aria-hidden />
          </Button>
        </div>
        {claim.notes ? (
          <p className="rounded-md border border-border bg-raised/40 px-3 py-2 text-meta text-subtle">
            «{claim.notes}»
          </p>
        ) : null}

        {claim.event ? (
          <div className="flex flex-wrap items-center gap-1.5 text-ui text-foreground">
            <CalendarCheck aria-hidden className="size-3.5 text-muted-foreground" />
            <Link
              className="underline-offset-2 hover:underline"
              href={`/organizar/panel/${community.slug}/eventos/${claim.event.id}${claim.event.status === "draft" ? "/editar" : ""}`}
            >
              {claim.event.name}
            </Link>
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {shortWhen(claim.event.startDate)}
            </span>
            {claim.event.status === "draft" ? <Badge variant="secondary">Borrador</Badge> : null}
          </div>
        ) : null}

        {acts && claim.status !== "given" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {events && choices.length > 0 ? (
              <Select value="" onValueChange={(eventId) => assign.mutate({ ...input, eventId })}>
                <SelectTrigger
                  aria-label={claim.event ? "Cambiar de evento" : "Asignar a un evento"}
                  className="h-8 w-60"
                >
                  <SelectValue placeholder={claim.event ? "Cambiar de evento" : "Asignar a un evento"} />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name} · {shortWhen(event.startDate)}
                      {event.status === "draft" ? " (borrador)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : events && !claim.event ? (
              <p className="text-meta text-muted-foreground">
                No hay eventos que vengan.{" "}
                <Link
                  className="text-info-foreground hover:underline"
                  href={`/organizar/panel/${community.slug}/eventos`}
                >
                  Creá uno en Eventos
                </Link>{" "}
                y asignala.
              </p>
            ) : null}
            {claim.status === "scheduled" && past ? (
              <Button disabled={given.isPending} size="sm" variant="outline" onClick={() => given.mutate(input)}>
                <Check aria-hidden />
                Se dio
              </Button>
            ) : null}
            <Button
              className="ml-auto"
              disabled={release.isPending}
              size="sm"
              variant="ghost"
              onClick={() => release.mutate(input)}
            >
              <Undo2 aria-hidden />
              Soltar
            </Button>
          </div>
        ) : null}

        {claim.event ? (
          <div className="flex flex-wrap items-center gap-2 text-meta">
            <span className="text-muted-foreground">Tarjetas para compartir:</span>
            <CardLink format="cuadrada" id={claim.id} kind="charla" label="Cuadrada" />
            <CardLink format="historia" id={claim.id} kind="charla" label="Historia" />
          </div>
        ) : null}
        {failed ? (
          <p className="text-meta text-live-foreground" role="alert">
            {failed.message}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
