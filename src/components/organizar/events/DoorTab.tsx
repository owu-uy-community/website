"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2Off, QrCode as QrIcon, ScanLine, Search, UserCheck } from "lucide-react";

import { useDebounced } from "components/Admin/access/shared";
import { ArrivalsFeed } from "components/Admin/attendees/ArrivalsFeed";
import { KpiStrip } from "components/Admin/attendees/KpiStrip";
import { QrCode } from "components/Admin/comms/QrCode";
import { ConfirmDialog } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { copyText } from "components/shared/ui/copy-text";
import { Input } from "components/shared/ui/input";
import { toast } from "components/shared/ui/toast-utils";
import { clockTime, MONTEVIDEO_TZ, shortWhen } from "lib/community/time";
import type { Attendee } from "lib/orpc/attendees/schemas";
import { client, orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";

import { usePanel } from "../shell/context";
import type { EventInput } from "./save";

/** A link for the volunteers at the door: made here, handed out as QR or text, revocable. */
function VolunteerLink({ input, linked }: { input: EventInput; linked: boolean }) {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState(false);
  const link = useMutation(
    orpc.events.doorLink.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() }),
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );
  const revoke = useMutation(
    orpc.events.revokeDoor.mutationOptions({
      onSuccess: () => {
        link.reset();
        setRevoking(false);
        void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
        toast.success("Links anulados", "Los que repartiste ya no abren la puerta.");
      },
      onError: (error) => toast.error("No se pudo anular", error.message),
    })
  );

  return (
    <Panel className="scroll-mt-20" id="puerta-link" tabIndex={-1}>
      <PanelHead icon={QrIcon} title="Link para quienes ayudan en la puerta" />
      <div className="flex flex-col gap-4 p-4">
        <p className="text-ui text-muted-foreground">
          Abre el escáner sin cuenta: escanean los QR, buscan por nombre y suman a quien llega sin anotarse. Vale hasta
          la noche del evento y lo podés anular cuando quieras.
        </p>
        {link.data ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="self-start rounded-lg bg-white p-2">
              <QrCode size={140} title="Link de la puerta" value={link.data.url} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="truncate rounded-md border border-border bg-raised/50 px-2.5 py-1.5 font-terminal text-meta text-foreground">
                {link.data.url}
              </p>
              <p className="text-meta text-muted-foreground">
                Vale hasta el <span className="font-terminal tabular-nums">{shortWhen(link.data.expiresAt)}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void copyText(link.data?.url ?? "", "Link copiado")}>
                  <Copy />
                  Copiar
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={link.data.url} rel="noreferrer" target="_blank">
                    <ExternalLink />
                    Abrir
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevoking(true)}>
                  <Link2Off />
                  Anular
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button disabled={link.isPending} variant="outline" onClick={() => link.mutate(input)}>
              <QrIcon />
              Crear el link
            </Button>
            {linked ? (
              <Button variant="ghost" onClick={() => setRevoking(true)}>
                <Link2Off />
                Anular los que repartiste
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <ConfirmDialog
        confirmLabel="Anular los links"
        description="Los links que repartiste dejan de abrir la puerta. Después podés crear uno nuevo."
        open={revoking}
        pending={revoke.isPending}
        pendingLabel="Anulando…"
        title="¿Anular los links de la puerta?"
        onConfirm={() => revoke.mutate(input)}
        onOpenChange={setRevoking}
      />
    </Panel>
  );
}

/**
 * Letting someone in by name from the computer at the door: search, "Hacer entrar", and undo if it
 * was the wrong person. Someone already in reads "Ya entró 19:42", with nothing to press.
 */
function ByName({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const found = useQuery(
    orpc.attendees.list.queryOptions({
      input: { eventId, q, pageSize: 10 },
      enabled: q.length >= 2,
      placeholderData: keepPreviousData,
    })
  );
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
  };
  const admit = useMutation({
    mutationFn: (person: Attendee) =>
      client.attendees.scan({
        eventId,
        code: person.barcode ?? person.eventbriteId ?? "",
        nonce: crypto.randomUUID(),
        device: "Puerta (panel)",
      }),
    onSuccess: (result, person) => {
      refresh();
      if (result.result !== "ok") {
        toast.error(`${person.name} no entró`, result.result === "repeat" ? "Ya había entrado." : "Su lugar no vale.");
        return;
      }
      toast.undo(
        `${person.name} entró`,
        () =>
          void client.attendees
            .undoCheckin({ eventId, attendeeId: person.id })
            .then(refresh, (error: Error) => toast.error("No se pudo deshacer", error.message))
      );
    },
    onError: (error) => toast.error("No se pudo hacer entrar", error.message),
  });

  return (
    <Panel>
      <PanelHead icon={Search} title="Hacer entrar por nombre" />
      <div className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-ui text-foreground" htmlFor="door-by-name">
          Nombre o email
          <Input
            autoComplete="off"
            id="door-by-name"
            placeholder="Escribí al menos dos letras"
            value={text}
            onChange={(change) => setText(change.target.value)}
          />
        </label>
        {q.length < 2 ? null : found.isError ? (
          <p className="text-ui text-live-foreground" role="alert">
            No pudimos buscar: {found.error.message}. Probá de nuevo.
          </p>
        ) : !found.data ? (
          <p className="text-ui text-muted-foreground">Buscando…</p>
        ) : found.data.rows.length === 0 ? (
          <p className="text-ui text-muted-foreground">Nadie con ese nombre o email.</p>
        ) : (
          <ul aria-label="Resultados" className="divide-y divide-border">
            {found.data.rows.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui font-medium text-foreground">{person.name}</p>
                  <p className="truncate text-meta text-muted-foreground">{person.email || person.ticketClass}</p>
                </div>
                {person.checkedInAt ? (
                  <span className="shrink-0 text-ui text-success-foreground tabular-nums">
                    Ya entró {clockTime(person.checkedInAt)}
                  </span>
                ) : person.status === "attending" ? (
                  <Button disabled={admit.isPending} size="sm" variant="outline" onClick={() => admit.mutate(person)}>
                    <UserCheck />
                    Hacer entrar
                  </Button>
                ) : (
                  <span className="shrink-0 text-meta text-muted-foreground">Sin lugar</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/**
 * The door: how many came in and the pace (KpiStrip), the latest who came in, letting someone in
 * by name from here, the scanner for phones, and the volunteers' link (members use that one).
 */
export function DoorTab({
  input,
  base,
  startDate,
  linked,
  registration,
  primary = true,
}: {
  input: EventInput;
  base: string;
  startDate: string;
  /** A volunteer link is out (made earlier, not revoked) */
  linked: boolean;
  registration: EditableEvent["registration"];
  /** The scanner is this view's yellow button; inside the day view, "Abrir la puerta" is */
  primary?: boolean;
}) {
  const { can } = usePanel();
  const { eventId } = input;
  const totals = useQuery(orpc.attendees.list.queryOptions({ input: { eventId, pageSize: 10 } }));
  const stats = useQuery(orpc.attendees.checkins.queryOptions({ input: { eventId }, refetchInterval: 60_000 }));
  const recent = useQuery(orpc.attendees.recent.queryOptions({ input: { eventId } }));

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip
        organizar
        opensAt={startDate}
        stats={stats.data}
        timezone={MONTEVIDEO_TZ}
        totals={totals.data?.totals}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {can("attendee:read") && can("attendee:checkin") ? <ByName eventId={eventId} /> : null}
          <Panel>
            <PanelHead icon={ScanLine} title="Escáner" />
            <div className="flex flex-wrap items-center gap-3 p-4">
              <p className="min-w-0 flex-1 text-ui text-muted-foreground">
                Desde tu celular: la cámara lee las entradas, también buscás por nombre o tipeás el código. Si se corta
                internet, guarda los escaneos y los manda al volver.
                {registration === "eventbrite" ? " Lo que entra por acá no llega a Eventbrite." : ""}
              </p>
              <Button asChild variant={primary ? "default" : "outline"}>
                <Link href={`${base}/puerta/escanear`}>
                  <ScanLine />
                  Abrir el escáner
                </Link>
              </Button>
            </div>
          </Panel>
          <VolunteerLink input={input} linked={linked} />
        </div>
        <ArrivalsFeed
          organizar
          entries={recent.data}
          error={recent.error}
          timezone={MONTEVIDEO_TZ}
          onRetry={() => void recent.refetch()}
        />
      </div>
    </div>
  );
}
