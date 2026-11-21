"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandHelping } from "lucide-react";

import { Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import type { VolunteerRole } from "lib/db/schema";
import { VOLUNTEER_ROLES, volunteerLabel } from "lib/organizar/presets";
import { orpc } from "lib/orpc/client";
import type { Volunteer } from "lib/orpc/events/schemas";

import type { EventInput } from "./save";

const NONE = "ninguna";

function Person({ input, person }: { input: EventInput; person: Volunteer }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<VolunteerRole | typeof NONE>(person.assigned ?? NONE);
  const assign = useMutation(
    orpc.events.assignVolunteer.mutationOptions({
      onSuccess: (saved) => {
        void queryClient.invalidateQueries({ queryKey: orpc.events.volunteers.key() });
        toast.success(
          saved.assigned
            ? `Le avisamos a ${person.name}: ${volunteerLabel(saved.assigned).toLowerCase()}`
            : `${person.name} ya no tiene tarea`
        );
      },
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );
  const changed = role !== (person.assigned ?? NONE);
  // Who offered what comes first, then the rest
  const roles = [
    ...VOLUNTEER_ROLES.filter((item) => person.offered.includes(item.value)),
    ...VOLUNTEER_ROLES.filter((item) => !person.offered.includes(item.value)),
  ];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-ui text-foreground">{person.name}</p>
        <p className="text-meta text-muted-foreground">
          {person.offered.length > 0
            ? `Se ofreció: ${person.offered.map((item) => volunteerLabel(item).toLowerCase()).join(", ")}`
            : "Sin preferencia"}
        </p>
      </div>
      <Select value={role} onValueChange={(value) => setRole(value as VolunteerRole | typeof NONE)}>
        <SelectTrigger aria-label={`Qué le toca a ${person.name}`} className="h-8 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin tarea</SelectItem>
          {roles.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {volunteerLabel(item.value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {changed ? (
        <Button
          disabled={assign.isPending}
          size="sm"
          variant="outline"
          onClick={() => assign.mutate({ ...input, attendeeId: person.attendeeId, role: role === NONE ? null : role })}
        >
          {role === NONE ? "Sacarle la tarea" : "Avisarle"}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * "Quiénes dan una mano": people with a seat who offered on the RSVP card. Giving one a job sends
 * them one email with the time ("¡Gracias! Te toca la puerta a las 18:30").
 */
export function VolunteersPanel({ input }: { input: EventInput }) {
  const list = useQuery(orpc.events.volunteers.queryOptions({ input }));

  return (
    <Panel>
      <PanelHead
        icon={HandHelping}
        meta={list.data ? String(list.data.length) : undefined}
        title="Quiénes dan una mano"
      />
      {list.isError ? (
        <ErrorState
          className="m-3"
          compact
          title="No pudimos traer quién se ofreció"
          onRetry={() => void list.refetch()}
        />
      ) : !list.data ? (
        <Skeleton className="m-4 h-16" />
      ) : list.data.length === 0 ? (
        <p className="px-4 py-3 text-meta text-muted-foreground">
          Todavía nadie se ofreció. La tarjeta de inscripción lo pregunta; cuando alguien diga que sí, aparece acá.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.data.map((person) => (
            <Person key={`${person.attendeeId}-${person.assigned ?? ""}`} input={input} person={person} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
