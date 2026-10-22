"use client";

import { useMutation } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

/**
 * GO and its undo, the same on the guion and on Hoy: a "Deshacer" toast after each GO, turned
 * into a longer warning when the cue or Owy's message didn't go out (the GO stands anyway).
 */
export function useGo(eventId: string, refresh: () => unknown) {
  const undo = useMutation(
    orpc.runOfShow.undo.mutationOptions({
      onSuccess: ({ item }) => toast.success("GO deshecho", item ? `«${item.title}» sigue en curso.` : undefined),
      onError: (error) => toast.error("No se pudo deshacer", error.message),
      onSettled: refresh,
    })
  );
  const go = useMutation(
    orpc.runOfShow.go.mutationOptions({
      onSuccess: ({ item, warnings, repeated }) => {
        if (repeated) {
          toast.info("Ya estaba en curso", item ? `«${item.title}» arrancó recién.` : undefined);
          return;
        }
        // One toast: a second one on top would cover this one's Deshacer. Touch has no hover to
        // hold a toast open, so it stays long enough to reach.
        const done = {
          title: item ? `GO · ${item.title}` : "Guion cerrado",
          action: { label: "Deshacer", onClick: () => undo.mutate({ eventId }) },
        };
        if (warnings.length > 0) toast.warning({ ...done, description: warnings.join(" · "), duration: 8000 });
        else toast.success({ ...done, duration: 4000 });
      },
      onError: (error) => toast.error("No se pudo dar GO", error.message),
      onSettled: refresh,
    })
  );

  return { go, undo };
}
