"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "app/lib/utils";
import { OwyFace, useFaceEvents, type FaceApi } from "components/OwyStage/Face";
import { applyFaceEvent } from "lib/owy-stage/face-flow";

/** The knurled ring's teeth, every 3°. */
const TEETH = Array.from({ length: 120 }, (_, i) => (i * Math.PI) / 60);

/**
 * The knob as it sits on the table: a drawing of the Waveshare Knob 1.8″ whose screen is the
 * firmware's own (the face runtime in device mode — the face, the hint under it, the answer view
 * with the captions, the cards, text and QR it is told), fed by the same events the bridge sends
 * the knob. Without the bridge it looks for it, like the real one. Tapping the screen is the
 * knob's tap.
 */
export function KnobTwin({
  id,
  online,
  privacy,
  reduced,
  label,
  disabled,
  onTap,
  className,
}: {
  /** The device whose events it shows (its bridge `source`). */
  id: string;
  /** The bridge is there: without it the screen says it is looking for it. */
  online: boolean;
  /** Pausa and «animaciones mínimas», as the panel holds them (the events confirm them live). */
  privacy: boolean;
  reduced: boolean;
  /** What a tap does now, for screen readers and the tooltip. */
  label: string;
  disabled?: boolean;
  onTap: () => void;
  className?: string;
}) {
  const face = useRef<FaceApi>(null);
  const uid = useId().replace(/:/g, "");

  const { forget } = useFaceEvents(
    {
      face: (event) => {
        if (face.current) applyFaceEvent(face.current, event);
      },
      mouth: (frames, at) => face.current?.mouth(frames, at),
      level: (level) => face.current?.level(level),
      screen: (event) => {
        const screen = face.current;
        if (!screen) return;
        if (event.kind === "caption") screen.caption(event.text);
        else if (event.kind === "heard") screen.heard(event.text);
        else if (event.kind === "text") screen.text(event.text);
        else if (event.url) screen.qr(event.url, event.text || undefined);
      },
      smile: () => face.current?.smile(),
    },
    { source: id }
  );
  // Without its bridge the knob shows «buscando a owy…»; back, the bridge's next heartbeat (4 s) says where Owy is.
  useEffect(() => {
    if (!online) face.current?.state("offline");
    else forget();
  }, [online, forget]);
  useEffect(() => {
    face.current?.privacy(privacy);
  }, [privacy]);
  useEffect(() => {
    face.current?.reduced(reduced);
  }, [reduced]);

  return (
    <div className={cn("relative aspect-square w-full select-none", className)}>
      <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 400 400">
        <defs>
          <radialGradient cx="34%" cy="28%" id={`${uid}-metal`} r="85%">
            <stop offset="0%" stopColor="#3b3b41" />
            <stop offset="55%" stopColor="#1d1d21" />
            <stop offset="100%" stopColor="#0b0b0d" />
          </radialGradient>
          <linearGradient id={`${uid}-bevel`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
          </linearGradient>
          <path d="M 200,200 m -162,0 a 162,162 0 1,1 324,0 a 162,162 0 1,1 -324,0" id={`${uid}-engraving`} />
        </defs>
        <ellipse cx="200" cy="392" fill="rgba(0,0,0,0.45)" rx="150" ry="10" />
        {/* The ring you turn: brushed metal with knurled teeth. */}
        <circle cx="200" cy="200" fill={`url(#${uid}-metal)`} r="198" />
        <g stroke="rgba(255,255,255,0.09)" strokeLinecap="round" strokeWidth="1.4">
          {TEETH.map((angle) => (
            <line
              key={angle}
              x1={200 + 179 * Math.cos(angle)}
              x2={200 + 195 * Math.cos(angle)}
              y1={200 + 179 * Math.sin(angle)}
              y2={200 + 195 * Math.sin(angle)}
            />
          ))}
        </g>
        <circle cx="200" cy="200" fill="none" r="197" stroke={`url(#${uid}-bevel)`} strokeWidth="1.5" />
        {/* The bezel around the glass, with what it is engraved on it. */}
        <circle cx="200" cy="200" fill="#08080a" r="176" stroke="rgba(255,255,255,0.07)" />
        <text className="font-terminal" fill="rgba(251,245,231,0.30)" fontSize="9.5" letterSpacing="3.2">
          <textPath href={`#${uid}-engraving`} startOffset="25%" textAnchor="middle">
            OWY · KNOB 1.8″ · 360 × 360
          </textPath>
        </text>
      </svg>
      <button
        aria-label={label}
        className={cn(
          "absolute inset-[14%] rounded-full outline-none",
          "transition-[transform,box-shadow] duration-150 motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-black",
          disabled
            ? "cursor-not-allowed"
            : "cursor-pointer hover:shadow-[0_0_0_3px_rgba(245,187,3,0.28)] active:scale-[0.985]"
        )}
        disabled={disabled}
        title={label}
        type="button"
        onClick={onTap}
      >
        {/* 30 fps, the knob's own panel rate (and a phone's battery thanks it). */}
        <OwyFace ref={face} device className="bg-black" fps={30} size={360} style={{ width: "100%", height: "100%" }} />
        {/* Glass: a faint highlight over the panel. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.09),transparent_42%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
        />
      </button>
    </div>
  );
}
