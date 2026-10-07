"use client";

import { useRef, useState } from "react";
import { Camera, ListPlus, Loader2, Monitor, MonitorOff } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { getObsClient, useObsThumbnails } from "lib/obs/client";

import { tallyClass, tallyOf } from "./tally";

const LONG_PRESS_MS = 550;

/** Put a scene where the operator expects: preview in studio mode, straight to air otherwise. */
export function selectScene(view: ObsView, actions: ObsActions, name: string, direct = false) {
  if (view.studioMode && !direct) return actions.setPreview(name);

  return actions.setProgram(name);
}

/** A scene's preview from OBS, or a placeholder until one arrives. */
export function SceneThumbnail({ name, className }: { name: string; className?: string }) {
  const thumbs = useObsThumbnails();
  const src = thumbs[name];

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-md bg-black/60", className)}>
      {src ? (
        <img alt="" className="h-full w-full object-cover" draggable={false} src={src} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Monitor className="h-6 w-6 opacity-40" />
        </div>
      )}
    </div>
  );
}

/**
 * The scene bus: every OBS scene as a card with its live thumbnail and tally
 * colours. Click = preview (studio) or air (direct); Shift+click / long-press
 * = air right now; the corner button toggles the scene in the loop queue.
 */
export function SceneBus({
  view,
  actions,
  queued,
  toggleQueued,
}: {
  view: ObsView;
  actions: ObsActions;
  /** scene name → 1-based position in the loop queue */
  queued: Record<string, number>;
  toggleQueued: (name: string) => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [walking, setWalking] = useState(false);
  const local = view.source === "local";

  const startHold = (name: string) => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      void selectScene(view, actions, name, true);
    }, LONG_PRESS_MS);
  };
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const walk = () => {
    if (
      !window.confirm(
        "Pasa cada escena al aire durante 1 segundo para capturar previews con todas las fuentes activas. ¿Seguir?"
      )
    )
      return;
    setWalking(true);
    getObsClient()
      .captureByWalking()
      .then(() => toast.success("Previews capturados"))
      .catch((error: unknown) => toast.error("No se pudo capturar", error instanceof Error ? error.message : undefined))
      .finally(() => setWalking(false));
  };

  if (!view.connected) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        <MonitorOff className="h-6 w-6 opacity-50" />
        Sin conexión a OBS: conectate desde esta pestaña o abrí el panel en la máquina de OBS.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {view.studioMode ? (
            <>
              Click: preview · <Kbd>⇧</Kbd>+click o mantener: al aire
            </>
          ) : (
            "Click: al aire (modo directo)"
          )}
          {view.source === "remote" && " · vía el puesto de control"}
        </span>
        <span className="flex items-center gap-2">
          {local && (
            <Button
              className="h-7 px-2 text-xs"
              disabled={walking}
              size="sm"
              title="Recorre cada escena al aire un segundo y guarda su preview"
              variant="ghost"
              onClick={walk}
            >
              {walking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Capturar previews
            </Button>
          )}
          <span className="shrink-0 whitespace-nowrap">{view.scenes.length} escenas</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {view.scenes.map((name, index) => {
          const tally = tallyOf(name, view);
          const position = queued[name];

          return (
            <div
              key={name}
              className={tallyClass(
                tally,
                "group focus-visible:ring-ring relative flex cursor-pointer touch-manipulation flex-col gap-1.5 rounded-lg p-1.5 select-none focus-visible:ring-2 focus-visible:outline-hidden active:scale-[.98]"
              )}
              role="button"
              tabIndex={0}
              onContextMenu={(event) => {
                event.preventDefault();
                void selectScene(view, actions, name, true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void selectScene(view, actions, name, event.shiftKey);
                }
              }}
              onPointerCancel={cancelHold}
              onPointerDown={(event) => event.pointerType !== "mouse" && startHold(name)}
              onPointerLeave={cancelHold}
              onPointerUp={cancelHold}
              onClick={(event) => {
                if (held.current) {
                  held.current = false;

                  return;
                }
                void selectScene(view, actions, name, event.shiftKey);
              }}
            >
              <SceneThumbnail name={name} />
              <div className="flex items-center gap-1 px-0.5">
                {index < 9 && <Kbd className="h-4 shrink-0 px-1 text-[9px] opacity-70">{index + 1}</Kbd>}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{name}</span>
                <button
                  aria-label={position ? "Quitar del loop" : "Agregar al loop"}
                  className={cn(
                    "flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[10px] font-bold",
                    position
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
                  )}
                  title={position ? `#${position} en el loop · click para quitar` : "Agregar al loop"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleQueued(name);
                  }}
                >
                  {position ?? <ListPlus className="h-3.5 w-3.5" />}
                </button>
              </div>
              {tally === "program" && (
                <span className="absolute top-2.5 left-2.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase shadow">
                  Al aire
                </span>
              )}
              {tally === "preview" && (
                <span className="absolute top-2.5 left-2.5 rounded bg-green-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase shadow">
                  Preview
                </span>
              )}
              {tally === "pending" && (
                <span className="absolute top-2.5 left-2.5 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-black uppercase shadow">
                  Enviando…
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
