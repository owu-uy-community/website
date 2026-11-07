"use client";

import { useContext, useState } from "react";

import { pressStart } from "app/fonts";
import type { SceneProps } from "lib/owy-stage/scenes";
import { cueAt, type Look } from "lib/owy-stage/unplugged";

import { Ambient, StageContext, useStageFrame } from "../Stage";
import { Rise } from "./parts";

/** unplugged.owu.uy's palette, background and pixel stars, at wall scale. */
const PINK = "#ff6ec7";
const STAR_COLORS = ["#4dd0e1", PINK, "#ffd54f"];
const ARCADE = [
  "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(255,110,199,0.12), transparent 70%)",
  "radial-gradient(circle at 20% 50%, rgba(255,110,199,0.05), transparent 50%)",
  "radial-gradient(circle at 80% 80%, rgba(77,208,225,0.05), transparent 50%)",
  "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,110,199,0.08) 2px 4px)",
  "#0a050a",
].join(", ");
/** The glitch frames: the black lifts and its scanlines show, like the reference video. */
const NOISE =
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 6px), rgba(255,255,255,0.035)";

/** Placed once (not Math.random), so every screen and the thumbnail match. */
const STARS = Array.from({ length: 150 }, (_, i) => {
  const random = (k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  return {
    left: `${random(1) * 100}%`,
    top: `${random(2) * 100}%`,
    color: STAR_COLORS[Math.floor(random(3) * STAR_COLORS.length)],
    animationDelay: `${random(4) * 3}s`,
    animationDuration: `${2 + random(5) * 2}s`,
  };
});

/** Unplugged's title: the first word white, the rest pink, its second letter flickering. */
function PixelTitle({ lead, rest, size, glow }: { lead: string; rest: string; size: number; glow?: boolean }) {
  return (
    <p
      className="leading-none whitespace-nowrap uppercase"
      style={{
        fontFamily: pressStart.style.fontFamily,
        fontSize: size,
        textShadow: glow ? "0 0 0.2em currentColor, 0 0 0.45em currentColor" : "0 0 0.04em currentColor",
      }}
    >
      <span className="text-white">{lead}</span>
      {rest && (
        <span className="ml-[0.2em]" style={{ color: PINK }}>
          {rest.slice(0, 1)}
          <span className="inline-block animate-unplugged-flicker">{rest.slice(1, 2)}</span>
          {rest.slice(2)}
        </span>
      )}
    </p>
  );
}

export function Unplugged({ params }: SceneProps<"unplugged">) {
  const { bg } = useContext(StageContext);
  const [cue, setCue] = useState(() => cueAt(0));
  useStageFrame((t) => {
    const next = cueAt(t);
    setCue((current) => (current.look === next.look && current.noise === next.noise ? current : next));
  });
  const shown = (look: Look) => ({ opacity: cue.look === look ? 1 : 0 });

  const cut = params.title.indexOf(" ");
  const lead = cut < 0 ? params.title : params.title.slice(0, cut);
  const rest = cut < 0 ? "" : params.title.slice(cut + 1);
  // Press Start 2P is monospaced at 1em a letter, so this keeps the title on one line
  const size = Math.min(120, Math.floor(1600 / params.title.length));

  return (
    <>
      {/* The brand shapes only open the scene: strobing them would flash half the wall */}
      {cue.look === "owu" && !cue.noise && <Ambient />}
      {bg === "black" && (
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden"
          style={{ ...shown("pixel"), background: ARCADE }}
        >
          {STARS.map(({ color, ...style }, i) => (
            <span
              key={i}
              className="absolute h-[4px] w-[4px] animate-unplugged-twinkle"
              style={{ ...style, background: color, boxShadow: `0 0 3px ${color}` }}
            />
          ))}
          <span
            className="absolute inset-x-0 top-0 h-[2px] animate-unplugged-sweep"
            style={{
              background: "linear-gradient(transparent, rgba(0,255,255,0.15), transparent)",
              boxShadow: "0 0 10px rgba(0,255,255,0.3)",
            }}
          />
        </div>
      )}
      <div className={`absolute inset-0 ${cue.noise ? "animate-glitch" : ""}`}>
        <div className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center" style={shown("owu")}>
          <Rise
            className={`leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase ${params.title.length > 16 ? "text-[120px]" : "text-[150px]"}`}
            delay={0.1}
          >
            {lead} {rest && <span className="text-[#F5BB03]">{rest}</span>}
          </Rise>
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={shown("pixel")}>
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-0 animate-unplugged-glow">
              <PixelTitle glow lead={lead} rest={rest} size={size} />
            </div>
            <PixelTitle lead={lead} rest={rest} size={size} />
          </div>
        </div>
      </div>
      {cue.noise && <div aria-hidden="true" className="absolute inset-0" style={{ background: NOISE }} />}
    </>
  );
}
