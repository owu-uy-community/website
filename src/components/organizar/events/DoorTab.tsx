"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2Off, QrCode as QrIcon, ScanLine } from "lucide-react";

import { ArrivalsFeed } from "components/Admin/attendees/ArrivalsFeed";
import { KpiStrip } from "components/Admin/attendees/KpiStrip";
import { QrCode } from "components/Admin/comms/QrCode";
import { ConfirmDialog } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { MONTEVIDEO_TZ, shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";

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
    <Panel>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(link.data?.url ?? "").then(() => toast.success("Link copiado"))
                  }
                >
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
 * The door: how many came and the pace (KpiStrip), the latest arrivals, the scanner for the
 * organizers on their phones, and the volunteers' link (members use that one, not the panel).
 */
export function DoorTab({
  input,
  base,
  startDate,
  linked,
}: {
  input: EventInput;
  base: string;
  startDate: string;
  /** A volunteer link is out (made earlier, not revoked) */
  linked: boolean;
}) {
  const { eventId } = input;
  const totals = useQuery(orpc.attendees.list.queryOptions({ input: { eventId, pageSize: 10 } }));
  const stats = useQuery(orpc.attendees.checkins.queryOptions({ input: { eventId }, refetchInterval: 60_000 }));
  const recent = useQuery(orpc.attendees.recent.queryOptions({ input: { eventId } }));

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip opensAt={startDate} stats={stats.data} timezone={MONTEVIDEO_TZ} totals={totals.data?.totals} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <PanelHead icon={ScanLine} title="Escáner" />
            <div className="flex flex-wrap items-center gap-3 p-4">
              <p className="min-w-0 flex-1 text-ui text-muted-foreground">
                Desde tu celular: la cámara lee las entradas, también buscás por nombre o tipeás el código. Si se corta
                internet, guarda los escaneos y los manda al volver.
              </p>
              <Button asChild>
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
          entries={recent.data}
          error={recent.error}
          timezone={MONTEVIDEO_TZ}
          onRetry={() => void recent.refetch()}
        />
      </div>
    </div>
  );
}
