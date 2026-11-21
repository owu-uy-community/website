"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck, Send } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { Textarea } from "components/shared/ui/textarea";
import { orpc } from "lib/orpc/client";

/** "Pedir acceso": the team's waitlist (access requests), answered from Equipo. */
export function RequestAccess({ communityId, pending }: { communityId: string; pending: boolean }) {
  const [message, setMessage] = useState("");
  const request = useMutation(orpc.access.request.mutationOptions());

  if (pending || request.isSuccess) {
    return (
      <p className="flex items-start gap-2 text-ui text-foreground" role="status">
        <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        Pediste acceso: quienes administran la comunidad lo ven en Equipo y te avisamos por mail.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        request.mutate({ communityId, message: message.trim() });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-meta text-muted-foreground">Contales para qué lo necesitás (opcional)</span>
        <Textarea maxLength={1000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      {request.isError ? (
        <p className="text-meta text-live-foreground" role="alert">
          {request.error.message || "No se pudo pedir acceso. Probá de nuevo en un rato."}
        </p>
      ) : null}
      <div>
        <Button disabled={request.isPending} type="submit">
          <Send />
          Pedir acceso
        </Button>
      </div>
    </form>
  );
}
