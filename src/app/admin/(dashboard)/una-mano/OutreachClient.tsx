"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, HandHeart, History, Mail, UserCheck } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { RelativeTime } from "components/Admin/ui/time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";
import type { OutreachRow } from "lib/orpc/outreach/schemas";

const REASONS: Record<OutreachRow["reason"], { label: string; tone: "destructive" | "warning" | "info" }> = {
  dormida: { label: "Dormida", tone: "destructive" },
  "en-riesgo": { label: "En riesgo", tone: "warning" },
  "un-organizador": { label: "Una sola persona", tone: "warning" },
  "pedido-sin-respuesta": { label: "Pedido sin respuesta", tone: "info" },
  "contacto-viejo": { label: "Contacto viejo", tone: "info" },
};

const STATUS_WORDS = { done: "lo marcó hecho", snoozed: "lo pospuso" } as const;

/** One reason a community needs a hand: why, since when, its team, and what staff can do. */
function Row({ row, onEmail }: { row: OutreachRow; onEmail: (row: OutreachRow) => void }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.outreach.list.key() });
  const undo = useMutation(
    orpc.outreach.undo.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo deshacer", error.message),
    })
  );
  const mark = useMutation(
    orpc.outreach.mark.mutationOptions({
      onSuccess: ({ id }, { status }) => {
        refresh();
        toast.undo(
          status === "done" ? `${row.community.name}: hecho` : `${row.community.name}: pospuesto 30 días`,
          () => undo.mutate({ id }),
          status === "done" ? "Vuelve en 90 días si sigue igual." : undefined
        );
      },
      onError: (error) => toast.error("No se pudo marcar", error.message),
    })
  );
  const target = { communityId: row.community.id, reason: row.reason };
  const reason = REASONS[row.reason];

  return (
    <li className="flex flex-col gap-3 border-b border-border p-3.5 last:border-0 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="text-ui font-semibold text-foreground underline-offset-4 hover:underline"
            href={`/admin/communities/${row.community.slug}`}
          >
            {row.community.name}
          </Link>
          <Badge variant={reason.tone}>{reason.label}</Badge>
        </div>
        <p className="mt-1 text-ui text-foreground">{row.why}</p>
        <p className="mt-1 text-meta text-muted-foreground">
          {row.since ? `Desde el ${shortWhen(row.since)}. ` : ""}
          {row.emailedAt ? (
            <>
              Les escribieron <RelativeTime date={row.emailedAt} />.
            </>
          ) : null}
        </p>
        <ul aria-label={`Equipo de ${row.community.name}`} className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta">
          {row.team.length === 0 ? (
            <li className="text-muted-foreground">Sin nadie con rol de editor o más</li>
          ) : (
            row.team.map((person) => (
              <li key={`${person.name}-${person.role}`} className="flex items-center gap-1.5 text-foreground">
                <StatusDot tone={person.active ? "ok" : "idle"} />
                {person.name}
                <span className="text-muted-foreground">{person.active ? "activa en 90 días" : "sin actividad"}</span>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button disabled={row.team.length === 0} size="sm" variant="outline" onClick={() => onEmail(row)}>
          <Mail />
          Escribirle al equipo
        </Button>
        <Button
          disabled={mark.isPending}
          size="sm"
          variant="outline"
          onClick={() => mark.mutate({ ...target, status: "done" })}
        >
          <Check />
          Hecho
        </Button>
        <Button
          disabled={mark.isPending}
          size="sm"
          variant="ghost"
          onClick={() => mark.mutate({ ...target, status: "snoozed" })}
        >
          <BellOff />
          Posponer 30 días
        </Button>
      </div>
    </li>
  );
}

/** Site staff's queue: communities that need a hand, the claims waiting, and what was done lately. */
export function OutreachClient() {
  const queryClient = useQueryClient();
  const queue = useQuery(orpc.outreach.list.queryOptions());
  const [writing, setWriting] = useState<OutreachRow | null>(null);
  const email = useMutation(
    orpc.outreach.email.mutationOptions({
      onSuccess: ({ sent }) => {
        toast.success(`Le escribimos a ${plural(sent, "persona", "personas")}`, "Las respuestas te llegan a tu mail.");
        setWriting(null);
        void queryClient.invalidateQueries({ queryKey: orpc.outreach.list.key() });
      },
      onError: (error) => toast.error("No se pudo mandar", error.message),
    })
  );
  const data = queue.data;

  return (
    <PageContainer>
      <PageHeader
        description="Comunidades quietas, con una sola persona organizando, o con un espacio que no responde. Escribile al equipo y marcalo hecho."
        meta={
          data ? (
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {plural(data.rows.length, "pendiente", "pendientes")}
            </span>
          ) : null
        }
        title="Comunidades que necesitan una mano"
      />
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHead icon={HandHeart} title="Para acompañar" />
          {queue.isPending ? (
            <div className="flex flex-col gap-2 p-3.5">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : queue.isError ? (
            <ErrorState className="m-3.5" retrying={queue.isFetching} onRetry={() => void queue.refetch()} />
          ) : data && data.rows.length > 0 ? (
            <ul>
              {data.rows.map((row) => (
                <Row key={`${row.community.id}-${row.reason}`} row={row} onEmail={setWriting} />
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              owy
              description="Cuando alguna lleve 60 días sin eventos, quede con una sola persona organizando o tenga un pedido sin respuesta, aparece acá."
              title="Todas las comunidades vienen bien"
            />
          )}
        </Panel>

        {data && data.claims.length > 0 ? (
          <Panel>
            <PanelHead
              actions={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/communities">Revisar en Comunidades</Link>
                </Button>
              }
              icon={UserCheck}
              meta={String(data.claims.length)}
              title="Pedidos para organizar"
            />
            <ul>
              {data.claims.map((claim) => (
                <li key={claim.id} className="border-b border-border px-3.5 py-2.5 text-ui last:border-0">
                  <span className="text-foreground">{claim.person}</span>
                  <span className="text-muted-foreground"> quiere organizar </span>
                  <span className="text-foreground">{claim.community.name}</span>
                  <span className="text-meta text-muted-foreground">
                    {" "}
                    · <RelativeTime date={claim.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {data && data.log.length > 0 ? (
          <Panel>
            <PanelHead icon={History} title="Lo último" />
            <ul>
              {data.log.map((entry) => (
                <li key={entry.id} className="border-b border-border px-3.5 py-2 text-meta last:border-0">
                  <span className="text-foreground">{entry.by ?? "Alguien"}</span>
                  <span className="text-muted-foreground">{` ${STATUS_WORDS[entry.status]}: `}</span>
                  <span className="text-foreground">{`${entry.community} · ${REASONS[entry.reason].label}`}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · <RelativeTime date={entry.at} />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>

      <AlertDialog open={writing !== null} onOpenChange={(open) => !open && !email.isPending && setWriting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Escribirle al equipo de ${writing?.community.name ?? ""}`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Le mandamos el mail de «${writing ? REASONS[writing.reason].label.toLowerCase() : ""}» a quienes editan o administran, firmado por vos. Las respuestas te llegan a tu mail.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={email.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={email.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (writing) email.mutate({ communityId: writing.community.id, reason: writing.reason });
              }}
            >
              {email.isPending ? "Mandando…" : `Escribir a ${plural(writing?.team.length ?? 0, "persona", "personas")}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
