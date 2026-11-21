"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";

import { FieldError, Notice } from "components/Admin/panel";
import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { ConductReports as Reports } from "lib/orpc/conduct/schemas";

type Report = Reports["reports"][number];

const STATUS = {
  open: { label: "Abierto", tone: "destructive" },
  in_progress: { label: "En curso", tone: "warning" },
  resolved: { label: "Resuelto", tone: "success" },
} as const;

function ReportCard({ eventId, report }: { eventId: string; report: Report }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const settle = {
    onSuccess: (data: Reports) => queryClient.setQueryData(orpc.conduct.reports.queryKey({ input: { eventId } }), data),
  };
  const addNote = useMutation(
    orpc.conduct.addNote.mutationOptions({
      ...settle,
      onSuccess: (data) => {
        settle.onSuccess(data);
        setNote("");
      },
      onError: (failure) => setError(failure.message),
    })
  );
  const setStatus = useMutation(
    orpc.conduct.setStatus.mutationOptions({
      ...settle,
      onError: (failure) => toast.error("No se pudo cambiar", failure.message),
    })
  );
  const status = STATUS[report.status];

  return (
    <Panel>
      <PanelHead
        actions={<Badge variant={status.tone}>{status.label}</Badge>}
        icon={ShieldCheck}
        meta={shortWhen(report.createdAt)}
        title="Reporte"
      />
      <div className="space-y-3 p-3.5">
        {report.involvesOrganizer ? (
          <Notice tone="danger">
            Involucra a alguien de la organización: lo lee solo el equipo de conducta de OWU.
          </Notice>
        ) : null}
        <p className="text-ui whitespace-pre-line text-foreground">{report.description}</p>
        <dl className="grid gap-1 text-meta sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-muted-foreground">Dónde o cuándo</dt>
          <dd className="text-foreground">{report.where ?? "No lo dijo"}</dd>
          <dt className="text-muted-foreground">Contacto</dt>
          <dd className="text-foreground">{report.contact ?? "Anónimo: no dejó cómo contactarle"}</dd>
        </dl>

        {report.notes.length > 0 ? (
          <ol aria-label="Lo que se hizo" className="space-y-2 border-t border-border pt-3">
            {report.notes.map((item) => (
              <li key={item.id} className="text-meta">
                <span className="text-foreground">{item.author ?? "Alguien"}</span>
                <span className="text-muted-foreground">{` · ${shortWhen(item.createdAt)}`}</span>
                <p className="text-ui whitespace-pre-line text-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        ) : null}

        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return setError("Escribí la nota");
            addNote.mutate({ eventId, id: report.id, body: note });
          }}
        >
          <Textarea
            aria-describedby={`note-error-${report.id}`}
            aria-label="Nota"
            maxLength={2000}
            placeholder="Qué hiciste, con quién hablaste, qué sigue."
            rows={2}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setError(undefined);
            }}
          />
          <FieldError id={`note-error-${report.id}`} message={error} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={addNote.isPending} size="sm" type="submit" variant="outline">
              {addNote.isPending ? "Anotando…" : "Anotar"}
            </Button>
            {report.status === "open" ? (
              <Button
                disabled={setStatus.isPending}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setStatus.mutate({ eventId, id: report.id, status: "in_progress" })}
              >
                Me ocupo
              </Button>
            ) : null}
            <Button
              disabled={setStatus.isPending}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                setStatus.mutate({ eventId, id: report.id, status: report.status === "resolved" ? "open" : "resolved" })
              }
            >
              {report.status === "resolved" ? "Reabrir" : "Marcar resuelto"}
            </Button>
          </div>
        </form>
      </div>
    </Panel>
  );
}

/**
 * The event's code-of-conduct reports, for its responders and OWU's conduct staff only. Anyone
 * else on the team gets "No tenés acceso", never the reports.
 */
export function ConductReports({ eventId, communitySlug }: { eventId: string; communitySlug: string }) {
  const reports = useQuery(orpc.conduct.reports.queryOptions({ input: { eventId } }));
  const back = (
    <Button asChild size="sm" variant="ghost">
      <Link href={`/organizar/panel/${communitySlug}/eventos/${eventId}?tab=ajustes`}>
        <ArrowLeft />
        Volver al evento
      </Link>
    </Button>
  );
  const forbidden = reports.error && "code" in reports.error && reports.error.code === "FORBIDDEN";

  return (
    <PageContainer size="small">
      <PageHeader
        actions={back}
        description={
          reports.data
            ? `${reports.data.event.name} · ${shortWhen(reports.data.event.startDate)}`
            : "Lo que reportaron desde la página del evento."
        }
        title="Reportes de conducta"
      />
      {reports.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : forbidden ? (
        <EmptyState
          description="Los reportes de conducta los leen solo quienes responden por la conducta de este evento y el equipo de conducta de OWU. Si te nombraron hace poco, recargá."
          icon={Lock}
          title="No tenés acceso"
        />
      ) : reports.isError ? (
        <ErrorState retrying={reports.isFetching} onRetry={() => void reports.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="info">
            {reports.data.as === "staff"
              ? "Los ves como equipo de conducta de OWU. "
              : "Los ves porque respondés por la conducta de este evento. "}
            Respondé en medio día si el evento está en curso, en 7 días si ya pasó. Es confidencial: no lo compartas.
          </Notice>
          {reports.data.reports.length === 0 ? (
            <EmptyState
              owy
              description="Si alguien reporta un problema desde la página del evento, aparece acá y te llega por mail."
              title="Ningún reporte"
            />
          ) : (
            reports.data.reports.map((report) => <ReportCard key={report.id} eventId={eventId} report={report} />)
          )}
        </div>
      )}
    </PageContainer>
  );
}
