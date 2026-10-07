"use client";

import { useEffect } from "react";

import { toast } from "components/shared/ui/toast-utils";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { client as rpc } from "lib/orpc/client";
import type { Cue } from "lib/orpc/obs-control/schemas";

import { selectScene } from "./SceneBus";

export const SHORTCUTS: [string, string][] = [
  ["1 – 9", "Escena n a preview (estudio) o al aire (directo)"],
  ["⇧ + 1 – 9", "Escena n al aire ya"],
  ["↵ / Espacio", "TAKE"],
  ["⌫", "CUT"],
  ["S", "Modo estudio on/off"],
  ["→ / ←", "Cue siguiente / anterior"],
  ["A – Z", "Disparar el cue con esa tecla"],
  ["M", "Mutear el primer audio"],
  ["?", "Esta ayuda"],
];

const fail = (title: string) => (error: unknown) =>
  toast.error(title, error instanceof Error ? error.message : undefined);

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.closest("[role=dialog]") !== null
  );
}

/** Keyboard for the desk: numbers for scenes, Enter/Backspace for TAKE/CUT, letters for cues. */
export function useObsHotkeys({
  instanceId,
  cues,
  view,
  actions,
  onHelp,
}: {
  instanceId: number;
  cues: Cue[];
  view: ObsView;
  actions: ObsActions;
  onHelp: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || typing(event.target)) return;
      const key = event.key;

      if (key === "?") {
        event.preventDefault();
        onHelp();

        return;
      }
      if (/^[1-9]$/.test(key)) {
        const scene = view.scenes[Number(key) - 1];
        if (scene) {
          event.preventDefault();
          void selectScene(view, actions, scene, event.shiftKey);
        }

        return;
      }
      if (key === "Enter" || key === " ") {
        if (view.studioMode && view.preview) {
          event.preventDefault();
          void actions.take();
        }

        return;
      }
      if (key === "Backspace") {
        if (view.studioMode && view.preview) {
          event.preventDefault();
          void actions.cut();
        }

        return;
      }
      if (key === "ArrowRight" || key === "ArrowLeft") {
        event.preventDefault();
        rpc.obsCue
          .step({ instanceId, direction: key === "ArrowRight" ? "next" : "prev" })
          .catch(fail("No se pudo avanzar"));

        return;
      }
      const letter = key.length === 1 ? key.toUpperCase() : "";
      if (letter === "S") {
        if (view.connected) void actions.setStudioMode(!view.studioMode);

        return;
      }
      if (letter === "M") {
        const first = view.inputs[0];
        if (first) void actions.setMute(first.name);

        return;
      }
      if (/^[A-Z]$/.test(letter)) {
        const cue = cues.find((c) => c.hotkey === letter);
        if (cue) {
          event.preventDefault();
          rpc.obsCue.fire({ id: cue.id }).catch(fail("No se pudo disparar el cue"));
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [instanceId, cues, view, actions, onHelp]);
}
