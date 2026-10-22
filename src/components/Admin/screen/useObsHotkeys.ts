"use client";

import { useEffect } from "react";

import { useShortcuts, type Shortcut } from "components/Admin/shell/shortcuts";
import { toast } from "components/shared/ui/toast-utils";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { client as rpc } from "lib/orpc/client";
import type { Cue } from "lib/orpc/obs-control/schemas";

import { selectScene } from "./SceneBus";

/** The keys this page handles itself, listed in the admin's `?` sheet. */
const SHORTCUTS: [string, string][] = [
  ["1 – 9", "Escena n a preview o al aire"],
  ["shift+1 – 9", "Escena n al aire ya"],
  ["enter / space", "TAKE"],
  ["backspace", "CUT"],
  ["s", "Modo estudio sí / no"],
  ["arrowright / arrowleft", "Cue siguiente / anterior"],
  ["a – z", "Disparar el cue con esa tecla"],
  ["m", "Silenciar o activar el primer audio"],
];
const SHEET: Shortcut[] = SHORTCUTS.map(([keys, label], index) => ({
  id: `obs.${index}`,
  keys,
  label,
  group: "OBS",
  run: () => {},
  displayOnly: true,
}));

const fail = (title: string) => (error: unknown) =>
  toast.error(title, error instanceof Error ? error.message : undefined);

/** Typing, or inside a dialog, a menu or an open list: the keys belong to it. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null
  );
}

/** A focused control that Enter, Space or the arrows already operate: a scene card, a fader, the tabs. */
const ownsKeys = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("button,a[href],[role=button],[role=tab],[role=slider],[role=switch],[role=checkbox]") !== null;

/**
 * Keyboard for the desk: numbers for scenes, Enter/Backspace for TAKE/CUT, letters for cues.
 * `?` is the admin's own: its sheet lists these keys too.
 */
export function useObsHotkeys({
  instanceId,
  cues,
  view,
  actions,
}: {
  instanceId: number;
  cues: Cue[];
  view: ObsView;
  actions: ObsActions;
}) {
  useShortcuts(SHEET);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A control that already handled the key (a scene card's Enter, a fader's arrows) keeps it.
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (typing(event.target)) return;
      const key = event.key;

      if (/^[1-9]$/.test(key)) {
        const scene = view.scenes[Number(key) - 1];
        if (scene) {
          event.preventDefault();
          void selectScene(view, actions, scene, event.shiftKey);
        }

        return;
      }
      if (key === "Enter" || key === " ") {
        if (ownsKeys(event.target)) return;
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
        if (ownsKeys(event.target)) return;
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
  }, [instanceId, cues, view, actions]);
}
