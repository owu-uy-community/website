"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Reorder, useDragControls } from "motion/react";
import { ChevronLeft, GripVertical, Monitor, Music, Pencil, Play, Plus, Tv } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import { findSound } from "lib/launchpad/sounds";
import type { ObsView } from "lib/obs/actions";
import { orpc } from "lib/orpc/client";
import type { Cue, ObsStatus } from "lib/orpc/obs-control/schemas";
import { SCENES, isSceneId } from "lib/owy-stage/scenes";

import { CUE_COLOR_CLASS, CueEditor, type CueDraft } from "./CueEditor";

function CueRow({
  cue,
  active,
  onFire,
  onEdit,
}: {
  cue: Cue;
  active: boolean;
  onFire: () => void;
  onEdit: () => void;
}) {
  const controls = useDragControls();
  const stageTitle = cue.stageScene && isSceneId(cue.stageScene) ? SCENES[cue.stageScene].title : null;
  const sound = cue.sound ? findSound(cue.sound)?.name : null;

  return (
    <Reorder.Item
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2",
        active ? "border-primary/40 bg-primary-surface" : "border-border bg-background"
      )}
      dragControls={controls}
      dragListener={false}
      value={cue}
    >
      <button
        aria-label={`Mover ${cue.name}`}
        className="relative cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
        type="button"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="size-4" />
      </button>
      <span className={cn("h-8 w-1.5 shrink-0 rounded-full", cue.color ? CUE_COLOR_CLASS[cue.color] : "bg-muted")} />
      <button className="min-w-0 flex-1 text-left" title={cue.notes ?? undefined} type="button" onClick={onFire}>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-ui font-semibold", active && "text-primary")}>{cue.name}</span>
          {cue.hotkey && <Kbd>{cue.hotkey}</Kbd>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
          {cue.obsScene && (
            <span className="inline-flex items-center gap-1">
              <Monitor className="h-3 w-3" /> {cue.obsScene}
            </span>
          )}
          {stageTitle && (
            <span className="inline-flex items-center gap-1">
              <Tv className="h-3 w-3" /> {stageTitle}
            </span>
          )}
          {sound && (
            <span className="inline-flex items-center gap-1">
              <Music className="h-3 w-3" /> {sound}
            </span>
          )}
          {!cue.obsScene && !stageTitle && !sound && <span>vacío</span>}
        </span>
        {/* The notes before the tap that fires it: a touchscreen never shows the title. */}
        {cue.notes ? <span className="mt-0.5 block truncate text-2xs text-subtle">{cue.notes}</span> : null}
      </button>
      <Button aria-label={`Editar ${cue.name}`} size="icon-sm" title="Editar" variant="ghost" onClick={onEdit}>
        <Pencil />
      </Button>
      <Button aria-label={`Disparar ${cue.name}`} size="icon-sm" title="Disparar" variant="outline" onClick={onFire}>
        <Play className="fill-current" />
      </Button>
    </Reorder.Item>
  );
}

/**
 * The rundown: ordered cues, the current one highlighted, ▶ Siguiente always
 * at hand. Cues are shared (server rows), so every device and the Stream Deck
 * step through the same list.
 */
export function Rundown({ instanceId, status, view }: { instanceId: number; status: ObsStatus | null; view: ObsView }) {
  const queryClient = useQueryClient();
  const cuesKey = orpc.obsCue.list.queryKey({ input: { instanceId } });
  const { data } = useQuery(orpc.obsCue.list.queryOptions({ input: { instanceId }, staleTime: 60_000 }));
  const [order, setOrder] = useState<Cue[]>([]);
  const [draft, setDraft] = useState<CueDraft | null>(null);

  useEffect(() => {
    if (data) setOrder(data);
  }, [data]);

  const fail = (title: string) => (error: Error) => toast.error(title, error.message);
  const fire = useMutation(orpc.obsCue.fire.mutationOptions({ onError: fail("No se pudo disparar el cue") }));
  const step = useMutation(orpc.obsCue.step.mutationOptions({ onError: fail("No se pudo avanzar") }));
  const reorder = useMutation(
    orpc.obsCue.reorder.mutationOptions({
      onSuccess: (cues) => queryClient.setQueryData(cuesKey, cues),
      onError: fail("No se pudo reordenar"),
    })
  );

  const currentIndex = order.findIndex((cue) => cue.id === status?.currentCueId);
  const next = order[(currentIndex + 1) % Math.max(order.length, 1)];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          className="min-w-0 flex-1 justify-start font-semibold"
          disabled={order.length === 0 || step.isPending}
          size="lg"
          variant="outline"
          onClick={() => step.mutate({ instanceId, direction: "next" })}
        >
          <Play className="fill-current" /> Siguiente
          {next && (
            <span className="min-w-0 flex-1 truncate text-left font-normal text-muted-foreground">· {next.name}</span>
          )}
          <Kbd className="ml-auto pointer-coarse:hidden">→</Kbd>
        </Button>
        <Button
          aria-label="Cue anterior"
          className="size-10"
          disabled={order.length === 0 || step.isPending}
          size="icon"
          title="Anterior (←)"
          variant="outline"
          onClick={() => step.mutate({ instanceId, direction: "prev" })}
        >
          <ChevronLeft />
        </Button>
        <Button
          aria-label="Nuevo cue"
          className="size-10"
          size="icon"
          title="Nuevo cue"
          variant="outline"
          onClick={() => setDraft({})}
        >
          <Plus />
        </Button>
      </div>

      {order.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-4 text-center text-meta text-muted-foreground">
          Sin cues todavía. Armá el guion del día: cada cue puede cambiar la escena de OBS, la pantalla Owy y disparar
          un sonido.
        </p>
      ) : (
        <Reorder.Group
          axis="y"
          className="space-y-1.5"
          values={order}
          onReorder={(cues: Cue[]) => {
            setOrder(cues);
            reorder.mutate({ instanceId, ids: cues.map((cue) => cue.id) });
          }}
        >
          {order.map((cue) => (
            <CueRow
              key={cue.id}
              active={cue.id === status?.currentCueId}
              cue={cue}
              onEdit={() => setDraft(cue)}
              onFire={() => fire.mutate({ id: cue.id })}
            />
          ))}
        </Reorder.Group>
      )}

      {draft !== null && <CueEditor draft={draft} instanceId={instanceId} view={view} onClose={() => setDraft(null)} />}
    </div>
  );
}
