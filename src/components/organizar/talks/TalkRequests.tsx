"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, RotateCcw, X } from "lucide-react";

import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { client, orpc } from "lib/orpc/client";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { usePanel } from "../shell/context";

/** «Buscamos charla sobre…»: what this community is looking for, shown on owu.uy/dar-una-charla until closed. */
export function TalkRequests({ community }: { community: CalendarCommunity }) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const input = { communityId: community.id };
  const requests = useQuery(orpc.talks.requests.list.queryOptions({ input }));
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.talks.requests.key() });
  const create = useMutation(
    orpc.talks.requests.create.mutationOptions({
      onSuccess: () => {
        setTopic("");
        setDetails("");
        toast.success("Pedido publicado", "Sale en owu.uy/dar-una-charla hasta que lo cierres.");
        refresh();
      },
    })
  );
  const setClosed = useMutation(
    orpc.talks.requests.setClosed.mutationOptions({
      onSuccess: (request) => {
        refresh();
        if (request.closedAt) {
          toast.undo(
            "Pedido cerrado",
            () =>
              void client.talks.requests
                .setClosed({ ...input, requestId: request.id, closed: false })
                .catch((error: Error) => toast.error("No se pudo deshacer", error.message))
                .finally(refresh)
          );
        }
      },
    })
  );

  return (
    <div className="flex flex-col gap-4">
      {can("talk:claim") ? (
        <Panel>
          <PanelHead icon={Megaphone} title="Nuevo pedido" />
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ ...input, topic, details });
            }}
          >
            <label className="flex flex-col gap-1.5">
              <MicroLabel>Buscamos charla sobre</MicroLabel>
              <Input
                maxLength={120}
                placeholder="Testing en el frontend"
                required
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <MicroLabel>Algo más (opcional)</MicroLabel>
              <Textarea
                maxLength={500}
                placeholder="Para la meetup de noviembre, 20 minutos, nivel inicial"
                rows={2}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={create.isPending || topic.trim().length < 3} type="submit">
                {create.isPending ? "Publicando…" : "Publicar pedido"}
              </Button>
              {create.isError ? (
                <p className="text-meta text-live-foreground" role="alert">
                  {create.error.message}
                </p>
              ) : null}
            </div>
          </form>
        </Panel>
      ) : null}

      {requests.isError ? (
        <ErrorState onRetry={() => void requests.refetch()} title="No pudimos traer los pedidos" />
      ) : !requests.data ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : requests.data.length === 0 ? (
        <Panel>
          <EmptyState
            compact
            description="Un pedido le dice a la gente de qué charla los ayudaría: lo ven en owu.uy/dar-una-charla."
            title="Ningún pedido todavía"
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHead icon={Megaphone} title="Sus pedidos" />
          <ul className="divide-y divide-border">
            {requests.data.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium text-foreground">{request.topic}</p>
                  {request.details ? <p className="text-meta text-muted-foreground">{request.details}</p> : null}
                  <p className="mt-1 font-terminal text-meta text-faint tabular-nums">{shortWhen(request.createdAt)}</p>
                </div>
                {request.closedAt ? (
                  <Badge variant="secondary">Cerrado</Badge>
                ) : (
                  <Badge variant="success">Abierto</Badge>
                )}
                {can("talk:claim") ? (
                  <Button
                    disabled={setClosed.isPending}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setClosed.mutate({ ...input, requestId: request.id, closed: request.closedAt === null })
                    }
                  >
                    {request.closedAt ? <RotateCcw aria-hidden /> : <X aria-hidden />}
                    {request.closedAt ? "Abrir de nuevo" : "Cerrar"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {setClosed.isError ? (
            <p className="px-4 pb-3 text-meta text-live-foreground" role="alert">
              {setClosed.error.message}
            </p>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
