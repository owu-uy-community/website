"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Notice } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import type { DraftPatch, EditableEvent } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

export type EventInput = { communityId: string; eventId: string };

/**
 * Saving a published event from its dashboard: the patch goes with the `updatedAt` this page
 * loaded and the answer replaces the cached event. A save someone else made in between (CONFLICT
 * stale) turns `stale` on until the event is loaded again.
 */
export function useEventSave(input: EventInput) {
  const queryClient = useQueryClient();
  const [stale, setStale] = useState(false);
  const key = orpc.events.get.queryKey({ input });
  const mutation = useMutation(
    orpc.events.save.mutationOptions({
      onSuccess: (event) => queryClient.setQueryData(key, event),
      onError: (error) => {
        if ((error as { data?: { reason?: string } }).data?.reason === "stale") setStale(true);
        else toast.error("No se pudo guardar", error.message);
      },
    })
  );

  return {
    /** True when it saved */
    save: (patch: DraftPatch) => {
      const event = queryClient.getQueryData<EditableEvent>(key);
      if (!event) return Promise.resolve(false);

      return mutation.mutateAsync({ ...input, expectedUpdatedAt: event.updatedAt, patch }).then(
        () => true,
        () => false
      );
    },
    saving: mutation.isPending,
    stale,
    reload: async () => {
      await queryClient.refetchQueries({ queryKey: key });
      setStale(false);
    },
  };
}

/** "Otra persona guardó…" with the way out: load the event again. */
export function StaleNotice({ show, onReload }: { show: boolean; onReload: () => void }) {
  return (
    <Notice show={show} tone="warning">
      <span className="flex flex-wrap items-center justify-between gap-2">
        Otra persona guardó cambios en este evento. Recargá para verlos y volvé a hacer el tuyo.
        <Button size="xs" variant="outline" onClick={onReload}>
          Recargar
        </Button>
      </span>
    </Notice>
  );
}
