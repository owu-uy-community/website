"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck, CirclePause, DoorOpen, PencilLine } from "lucide-react";

import { Panel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc/client";
import type { CheckView } from "lib/orpc/venues/schemas";

import { VenueFactsFields } from "./VenueFactsFields";

const DONE = {
  yes: {
    icon: CircleCheck,
    title: "¡Gracias! Siguen recibiendo pedidos",
    text: "Te volvemos a preguntar dentro de un año.",
  },
  pause: {
    icon: CirclePause,
    title: "Listo, pausamos los pedidos",
    text: "Nadie les va a pedir fecha hasta que vuelvan. Cuando quieras, respondé este link o escribinos a OWU.",
  },
  left: {
    icon: DoorOpen,
    title: "Gracias por avisar",
    text: "Ya no te llegan pedidos. Si alguien más de la empresa puede recibirlos, que se sume en owu.uy/empresas/espacio.",
  },
} as const;

/** "¿Siguen pudiendo recibir meetups?": three answers, each one POST, and the space's facts to fix on the way. */
export function HostCheck({ token, view }: { token: string; view: CheckView }) {
  const [facts, setFacts] = useState(view.facts);
  const [editing, setEditing] = useState(false);
  const answer = useMutation(
    orpc.venues.checkAnswer.mutationOptions({
      onError: (error) => toast.error("No se pudo guardar tu respuesta", error.message),
    })
  );
  const done = answer.data ? DONE[answer.data.answer] : view.left ? DONE.left : null;
  const send = (choice: "yes" | "pause" | "left") =>
    answer.mutate({ token, answer: choice, ...(editing && choice !== "left" ? { facts } : {}) });

  return (
    <Panel>
      <h1 className="border-b border-border px-4 py-3 text-ui font-semibold text-pretty text-foreground">
        ¿{view.venueName} sigue pudiendo recibir meetups?
      </h1>
      <div className="flex flex-col gap-4 p-4">
        {done ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-raised px-3.5 py-3" role="status">
            <done.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="text-ui font-medium text-foreground">{done.title}</p>
              <p className="text-meta text-muted-foreground">{done.text}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-ui text-muted-foreground">
              {view.contactName ? `Hola ${view.contactName}: u` : "U"}na vez al año preguntamos, así los pedidos de las
              comunidades le llegan a quien puede responderlos.
            </p>
            {editing ? (
              <VenueFactsFields value={facts} onChange={setFacts} />
            ) : (
              <Button className="self-start" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <PencilLine />
                Actualizar cómo es el espacio (opcional)
              </Button>
            )}
            <div className="flex flex-col gap-2">
              <Button className="h-11 w-full" disabled={answer.isPending} onClick={() => send("yes")}>
                <CircleCheck />
                Sí, seguimos
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-11" disabled={answer.isPending} variant="outline" onClick={() => send("pause")}>
                  Por ahora no
                </Button>
                <Button className="h-11" disabled={answer.isPending} variant="ghost" onClick={() => send("left")}>
                  Ya no trabajo ahí
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
