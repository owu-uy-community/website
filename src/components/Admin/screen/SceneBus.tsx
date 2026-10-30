"use client";

import { useRef, useState } from "react";
import { Camera, Clapperboard, ListPlus, Loader2, Monitor, MonitorOff } from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { getObsClient, useObsThumbnails } from "lib/obs/client";

import { tallyChip, tallyClass, tallyOf } from "./tally";

const LONG_PRESS_MS = 550;

/**
 * After a click or a tap, give the focus back to the page, so the next Space or Enter is TAKE and
 * not the same control again. Keyboard activations (detail 0) keep their focus.
 */
export const releaseFocus = (event: { detail: number; currentTarget: HTMLElement }) => {
  if (event.detail > 0) event.currentTarget.blur();
};

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
          <Monitor aria-hidden className="size-6 opacity-40" />
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
      <Panel>
        <PanelHead icon={Clapperboard} title="Escenas" />
        <EmptyState
          className="m-3.5"
          description="Conectate desde esta pestaña o abrí esta página en la máquina de OBS."
          icon={MonitorOff}
          title="Sin conexión a OBS"
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead
        actions={
          local && (
            <Button
              disabled={walking}
              size="sm"
              title="Recorre cada escena al aire un segundo y guarda su preview"
              variant="ghost"
              onClick={walk}
            >
              {walking ? <Loader2 className="animate-spin" /> : <Camera />}
              Capturar previews
            </Button>
          )
        }
        icon={Clapperboard}
        meta={`${view.scenes.length} ${view.scenes.length === 1 ? "escena" : "escenas"}`}
        title="Escenas"
      />
      <p className="px-3.5 pt-2.5 text-meta text-muted-foreground">
        {view.studioMode ? (
          <>
            <span className="pointer-coarse:hidden">
              Click: preview · <Kbd>⇧</Kbd>+click o mantener: al aire
            </span>
            <span className="pointer-fine:hidden">Tocá: preview · mantené apretado: al aire</span>
          </>
        ) : (
          "Click: al aire (modo directo)"
        )}
        {view.source === "remote" && " · vía el puesto de control"}
      </p>
      <div className="grid grid-cols-2 gap-2 p-3.5 pt-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
              aria-label={tally === "program" ? `${name}, al aire` : tally === "preview" ? `${name}, en preview` : name}
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
                releaseFocus(event);
                if (held.current) {
                  held.current = false;

                  return;
                }
                void selectScene(view, actions, name, event.shiftKey);
              }}
            >
              <SceneThumbnail name={name} />
              <div className="flex items-center gap-1 px-0.5">
                {index < 9 && <Kbd className="shrink-0 pointer-coarse:hidden">{index + 1}</Kbd>}
                <span className="min-w-0 flex-1 truncate text-meta font-semibold">{name}</span>
                <button
                  aria-label={position ? `Quitar ${name} del loop` : `Agregar ${name} al loop`}
                  className={cn(
                    "relative flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm px-1 font-terminal text-3xs font-semibold tabular-nums pointer-coarse:after:absolute pointer-coarse:after:-inset-3",
                    position
                      ? "bg-raised text-foreground ring-1 ring-input"
                      : "text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 pointer-coarse:opacity-100"
                  )}
                  title={position ? `#${position} en el loop · click para quitar` : "Agregar al loop"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleQueued(name);
                  }}
                  // Holding it must not count as holding the card (which puts the scene on air).
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {position ? (
                    <>
                      {/* A bare number says little to a finger, which never sees the title. */}
                      <span className="mr-0.5 pointer-fine:hidden">Loop</span>
                      {position}
                    </>
                  ) : (
                    <ListPlus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {tally !== "none" && (
                <span className={tallyChip(tally, "absolute top-2.5 left-2.5 backdrop-blur")}>
                  {tally === "program" ? "Al aire" : tally === "preview" ? "Preview" : "Enviando…"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
