"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { SettingsCard, SettingsSection } from "components/Admin/settings/settings";
import { ErrorState } from "components/Admin/ui/states";
import { Checkbox } from "components/shared/ui/checkbox";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { roleLabel } from "lib/authz/labels";
import { MAX_RESPONDERS, RESPONDERS_RULE, respondersNeeded } from "lib/organizar/steps";
import { orpc } from "lib/orpc/client";

/**
 * Who responds for the event's code of conduct: 1 to 3 people of the team, picked with a tap (each
 * change saves). The event's page names them. Also for the wizard: give it the event's id.
 */
export function ResponderPicker({ eventId, disabled = false }: { eventId: string; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const input = { eventId };
  const team = useQuery(orpc.conduct.team.queryOptions({ input }));
  const save = useMutation(
    orpc.conduct.setResponders.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(orpc.conduct.team.queryKey({ input }), result);
        void queryClient.invalidateQueries({ queryKey: orpc.events.get.key() });
        toast.success("Guardado", "La página del evento ya lo muestra.");
      },
      onError: (error) => toast.error("No se pudo guardar", error.message),
    })
  );

  if (team.isPending) return <Skeleton className="h-24" />;
  if (team.isError) return <ErrorState compact retrying={team.isFetching} onRetry={() => void team.refetch()} />;
  const { candidates, capacity } = team.data;
  const responders = save.isPending && save.variables ? save.variables.userIds : team.data.responders;
  const needed = respondersNeeded(capacity);
  const missing = needed - responders.length;

  return (
    <div className="space-y-3">
      <p className="text-meta text-muted-foreground">
        {`Elegí hasta ${MAX_RESPONDERS} personas del equipo a quienes acudir si algo no está bien. ${RESPONDERS_RULE} Sus nombres aparecen en la página del evento.`}
      </p>
      {candidates.length === 0 ? (
        <p className="text-ui text-foreground">Nadie del equipo tiene rol de editor o más todavía.</p>
      ) : (
        <ul aria-label="Responsables de conducta" className="space-y-1">
          {candidates.map((person) => {
            const id = `responder-${person.userId}`;
            const checked = responders.includes(person.userId);
            const full = !checked && responders.length >= MAX_RESPONDERS;

            return (
              <li key={person.userId}>
                <label
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 text-ui text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground"
                  htmlFor={id}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled || full || save.isPending}
                    id={id}
                    onCheckedChange={(on) =>
                      save.mutate({
                        eventId,
                        userIds: on
                          ? [...responders, person.userId]
                          : responders.filter((userId) => userId !== person.userId),
                      })
                    }
                  />
                  {person.name}
                  <span className="text-meta text-muted-foreground">{roleLabel(person.role)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <Notice show={missing > 0} tone="warning">
        {`El evento es para ${capacity ?? 0} lugares: ${missing === 1 ? "falta 1 responsable" : `faltan ${missing} responsables`} para poder publicarlo.`}
      </Notice>
      <Notice show={missing <= 0 && responders.length === 0} tone="info">
        Sin responsables, quien reporte un problema solo le llega al equipo de conducta de OWU. Sumá a alguien.
      </Notice>
    </div>
  );
}

/** Ajustes → Código de conducta: the responders, and where their reports are read. */
export function ConductSection({ event }: { event: { id: string; communitySlug: string; status: string } }) {
  return (
    <SettingsSection
      actions={
        <Link
          className="text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href={`/organizar/panel/${event.communitySlug}/eventos/${event.id}/conducta`}
        >
          Ver los reportes
        </Link>
      }
      id="conducta"
      title="Código de conducta"
    >
      <SettingsCard className="py-4">
        <div className="mb-3 flex items-center gap-2 text-ui font-medium text-foreground">
          <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
          Responsables de conducta
        </div>
        <ResponderPicker disabled={event.status === "cancelled"} eventId={event.id} />
        <p className="mt-3 text-meta text-muted-foreground">
          Los reportes les llegan por mail a quienes elijas y al equipo de conducta de OWU; si nombran a alguien de la
          organización, solo a OWU.
        </p>
      </SettingsCard>
    </SettingsSection>
  );
}
