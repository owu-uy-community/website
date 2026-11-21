"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileJson, Globe } from "lucide-react";

import { SwitchRow } from "components/Admin/panel";
import { downloadCsv } from "components/Admin/attendees/helpers";
import { PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";

import { NumbersView } from "./NumbersView";

/** Save a file the server built, under its own name. */
function save(filename: string, content: string) {
  const type = filename.endsWith(".json") ? "application/json" : "text/csv;charset=utf-8";
  const url = URL.createObjectURL(new Blob([content], { type }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const FILES = [
  { key: "eventos", label: "Eventos" },
  { key: "asistencia", label: "Asistencia" },
  { key: "equipo", label: "Equipo" },
  { key: "seguidores", label: "Seguidores" },
] as const;

/**
 * "Descargar los datos de la comunidad": one CSV per dataset and everything aggregate as JSON,
 * and (for who may export attendees) one event's sign-ups.
 */
function ExportPanel({
  communityId,
  events,
  canExportAttendees,
}: {
  communityId: string;
  events: { id: string; name: string; startDate: string }[];
  canExportAttendees: boolean;
}) {
  const files = useQuery({ ...orpc.insights.export.queryOptions({ input: { communityId } }), enabled: false });
  const [eventId, setEventId] = useState<string>();
  const attendees = useMutation(
    orpc.attendees.export.mutationOptions({
      onSuccess: downloadCsv,
      onError: (error) => toast.error("No se pudo descargar", error.message),
    })
  );
  const download = async (name: string) => {
    const data = files.data ?? (await files.refetch()).data;
    const file = name === "json" ? data?.json : data?.csv.find((item) => item.filename.includes(`-${name}-`));
    if (!file) return toast.error("No se pudo preparar el archivo", "Probá de nuevo en un rato.");
    save(file.filename, file.content);
  };

  return (
    <Panel id="exportar">
      <PanelHead icon={Download} title="Descargar los datos de la comunidad" />
      <div className="flex flex-col gap-3 p-3.5">
        <p className="text-ui text-foreground">
          Llevate lo que la comunidad armó en OWU, para tenerlo o pasarlo a otra plataforma, o para responder un pedido
          de acceso a datos (Ley 18.331: tenés 5 días hábiles).
        </p>
        <ul className="list-disc space-y-1 pl-5 text-meta text-muted-foreground">
          <li>Eventos: fecha, nombre, formato, lugar y cupo.</li>
          <li>
            Asistencia: por evento, cuántos se anotaron, esperaron, entraron, eran nuevos y la encuesta. Números, no
            nombres.
          </li>
          <li>Equipo: nombre, email, rol y desde cuándo.</li>
          <li>Seguidores: cuántos son. Quiénes no: siguen a la comunidad, no te dieron sus datos.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          {FILES.map((file) => (
            <Button
              key={file.key}
              disabled={files.isFetching}
              variant="outline"
              onClick={() => void download(file.key)}
            >
              <Download />
              {`${file.label} (CSV)`}
            </Button>
          ))}
          <Button disabled={files.isFetching} variant="outline" onClick={() => void download("json")}>
            <FileJson />
            Todo en JSON
          </Button>
        </div>
        {canExportAttendees && events.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <p className="w-full text-meta text-muted-foreground">
              Inscriptos de un evento: nombre, email, entrada y si entraron; sin las respuestas sensibles (cédula).
            </p>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger aria-label="Evento" className="w-72 max-w-full">
                <SelectValue placeholder="Elegí un evento" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {`${event.name} · ${shortWhen(event.startDate)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!eventId || attendees.isPending}
              variant="outline"
              onClick={() => eventId && attendees.mutate({ eventId })}
            >
              <Download />
              Inscriptos (CSV)
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/** Números: the community's numbers, sharing them on OWU's impact page, and its data to download. */
export function NumbersClient({
  communityId,
  canShare,
  canExport,
  canExportAttendees,
}: {
  communityId: string;
  canShare: boolean;
  canExport: boolean;
  canExportAttendees: boolean;
}) {
  const queryClient = useQueryClient();
  const input = { communityId };
  const numbers = useQuery(orpc.insights.community.queryOptions({ input }));
  const share = useMutation(
    orpc.insights.setPublic.mutationOptions({
      onSuccess: ({ publicStats }) => {
        void queryClient.invalidateQueries({ queryKey: orpc.insights.community.key() });
        toast.success(
          publicStats ? "Sus números ya se ven en OWU" : "Sus números ya no se ven en OWU",
          publicStats ? "En owu.uy/comunidades/numeros, solo totales por año." : undefined
        );
      },
      onError: (error) => toast.error("No se pudo cambiar", error.message),
    })
  );
  const data = numbers.data;

  return (
    <>
      <PageHeader
        description="Lo que importa no es cuántos se anotan sino cuántos vuelven. Cada número con su cuenta; nunca quién."
        meta={
          data ? (
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {plural(data.followers, "seguidor", "seguidores")}
            </span>
          ) : null
        }
        title="Números"
      />
      <div className="flex flex-col gap-4">
        {numbers.isPending ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : numbers.isError ? (
          <ErrorState
            description="No pudimos calcular los números. Probá de nuevo."
            retrying={numbers.isFetching}
            onRetry={() => void numbers.refetch()}
          />
        ) : (
          <NumbersView numbers={numbers.data} />
        )}
        {canShare && data ? (
          <SwitchRow
            checked={data.publicStats}
            disabled={share.isPending}
            hint="Solo totales por año (eventos, personas, primera vez), nunca nombres. Para que espacios y sponsors vean lo que hacen."
            icon={Globe}
            id="public-stats"
            label="Mostrar nuestros números en la página de impacto de OWU"
            onCheckedChange={(publicStats) => share.mutate({ communityId, publicStats })}
          />
        ) : null}
        {canExport ? (
          <ExportPanel canExportAttendees={canExportAttendees} communityId={communityId} events={data?.events ?? []} />
        ) : null}
      </div>
    </>
  );
}
