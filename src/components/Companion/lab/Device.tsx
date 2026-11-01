"use client";

import type { Ref, RefObject } from "react";
import { Activity, AudioLines, Fingerprint, Hand, Mic, Radio, RotateCcw, Settings2, Smartphone } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { OwyFace, type FaceApi } from "components/OwyStage/Face";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";

import { LevelMeter } from "../LiveVoicePanel";
import type { Mode, Snapshot } from "./emulator";

export type Board = "amoled" | "knob";

/** The knob's ring of ticks around its screen. */
const KNOB_RING =
  "repeating-conic-gradient(hsl(var(--muted-foreground) / 0.55) 0deg 1.2deg, transparent 1.2deg 7.5deg)";
export type Input = (type: string, values?: number[], text?: string) => void;

/**
 * The left column: the round device (the emulator's AMOLED, or the knob's face mirroring it),
 * its mic and voice levels and the gestures (none while a recording plays). With the focus on
 * it, the keyboard is the device: Space taps, H holds, P pets, W wakes, S shakes, C centres,
 * arrows tilt.
 */
export function DevicePanel({
  board,
  mode,
  ready,
  state,
  screen,
  knob,
  input,
  shake,
  pet,
  tilt,
}: {
  board: Board;
  mode: Mode;
  ready: boolean;
  state: Snapshot | null;
  /** Where the emulator's canvas lives; always mounted, the worker paints it. */
  screen: RefObject<HTMLDivElement | null>;
  /** The knob's face; null while the lab is out of sight (no face worker runs then). */
  knob: Ref<FaceApi> | null;
  input: Input;
  shake: () => void;
  pet: () => void;
  /** An arrow key: tilt by this many degrees on axis 0 (side) or 1 (front). */
  tilt: (axis: 0 | 1, by: number) => void;
}) {
  const replay = mode === "replay";
  const pointer = (event: React.PointerEvent<HTMLDivElement>, pressed: number) => {
    if (!ready || replay) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(465, ((event.clientX - rect.left) * 466) / rect.width));
    const y = Math.max(0, Math.min(465, ((event.clientY - rect.top) * 466) / rect.height));
    input("pointer", [x, y, pressed]);
  };
  const gestures = [
    { label: "Tocar", icon: Mic, run: () => input("boot", [100]), hint: "␣", key: " " },
    { label: "Mantener", icon: Settings2, run: () => input("boot", [900]), hint: "H", key: "h" },
    { label: "Acariciar", icon: Hand, run: pet, hint: "P", key: "p" },
    { label: "Activación", icon: Radio, run: () => input("wake"), hint: "W", key: "w" },
    { label: "Sacudir", icon: Activity, run: shake, hint: "S", key: "s" },
    { label: "Centrar", icon: RotateCcw, run: () => input("center"), hint: "C", key: "c" },
  ];
  const keys: Record<string, () => void> = {
    ...Object.fromEntries(gestures.map(({ key, run }) => [key, run])),
    arrowleft: () => tilt(0, -10),
    arrowright: () => tilt(0, 10),
    arrowup: () => tilt(1, -10),
    arrowdown: () => tilt(1, 10),
  };
  const shortcuts = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || replay || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const action = keys[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <Panel>
      <PanelHead
        icon={Smartphone}
        meta={board === "amoled" ? `${state?.page ?? "face"} · 466 × 466` : "solo la cara · 360 × 360"}
        title={board === "amoled" ? "AMOLED" : "Knob"}
      />
      <div className="space-y-4 p-4">
        <div
          aria-label="Owy. Espacio: tocar. H: mantener. P: acariciar. W: activación. S: sacudir. C: centrar. Flechas: inclinar."
          className="flex flex-col items-center rounded-lg bg-[radial-gradient(circle_at_50%_30%,hsl(var(--primary)/0.10),transparent_60%)] py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          role="group"
          tabIndex={0}
          onKeyDown={shortcuts}
        >
          {/* The emulator's screen stays mounted under the knob: the worker keeps painting it. */}
          <div
            className={cn(
              "relative aspect-square w-full max-w-[486px] shrink-0 overflow-hidden rounded-full border-[10px] border-input bg-black shadow-[0_30px_70px_rgba(0,0,0,0.6),inset_0_0_0_2px_rgba(255,255,255,0.05)]",
              board !== "amoled" && "hidden"
            )}
          >
            <div
              ref={screen}
              aria-label="La pantalla de Owy, 466 por 466 píxeles: tocala o arrastrá."
              className={cn(
                "h-full w-full touch-none rounded-full transition-opacity",
                ready && !replay && "cursor-pointer"
              )}
              role="img"
              style={{ opacity: state?.powered === false ? 0 : state?.dimmed ? 0.15 : 1 }}
              onPointerCancel={(event) => pointer(event, 0)}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pointer(event, 1);
              }}
              onPointerMove={(event) => {
                if (event.buttons) pointer(event, 1);
              }}
              onPointerUp={(event) => {
                pointer(event, 0);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            />
            {!ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-meta text-muted-foreground">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Despertando los píxeles reales…
              </div>
            )}
          </div>
          {board === "knob" && (
            <>
              <div className="rounded-full p-[18px]" style={{ background: KNOB_RING }}>
                {knob ? (
                  <OwyFace ref={knob} board="knob" className="bg-black" size={360} />
                ) : (
                  <div className="size-[360px] rounded-full bg-black" />
                )}
              </div>
              <p className="mt-4 text-meta text-muted-foreground">Solo la cara; gestos y pantallas son del AMOLED.</p>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <LevelMeter color="hsl(var(--info))" label="Mic" value={state?.envelope[0] ?? 0} />
          <LevelMeter color="hsl(var(--primary))" label="Voz" value={(state?.envelope[1] ?? 0) / 100} />
        </div>

        {!replay && (
          <div className="space-y-2">
            <MicroLabel className="flex items-center gap-2">
              <Fingerprint aria-hidden className="h-3.5 w-3.5" /> Gestos
            </MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gestures.map(({ label, icon: Icon, run, hint }) => (
                <Button
                  key={label}
                  className="min-w-0 justify-between overflow-hidden"
                  disabled={!ready}
                  size="sm"
                  variant="outline"
                  onClick={run}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                  <Kbd className="ml-2 shrink-0 pointer-coarse:hidden">{hint}</Kbd>
                </Button>
              ))}
            </div>
            {mode === "simulated" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!ready || state?.phase !== 2}
                  size="sm"
                  title="Con Owy escuchando: una frase simulada"
                  onClick={() => input("speech", [1, 1200])}
                >
                  <AudioLines /> Decir algo
                </Button>
                <Button disabled={!ready} size="sm" variant="ghost" onClick={() => input("page", [], "help")}>
                  Deslizar ← ayuda
                </Button>
                <Button disabled={!ready} size="sm" variant="ghost" onClick={() => input("page", [], "qr")}>
                  Deslizar → QR
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
