"use client";

import { useContext } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { TALKS, type Speaker, type Talk } from "app/conf/talks";
import type { SceneProps } from "lib/owy-stage/scenes";

import { Ambient, BRAND, StageContext } from "../Stage";
import { LowerThird } from "./more";
import { Rise } from "./parts";

/** The OWU CONF 2026 talks (app/conf/talks.ts), with the people cut out from their brand shapes. */

const names = (talk: Talk) => talk.speakers.map(({ name }) => name).join(" y ");

const SHAPE_FILL: Record<Speaker["shape"], string> = {
  flag: BRAND.yellow,
  circle: BRAND.cream,
  triangle: BRAND.blue,
};

/* The site portraits' shapes, drawn over each cutout's box in the site's 640 coordinates. The circle floats above the head
   instead of behind it: Ciro's cutout fades out at the top (his photo crops the hair) and that fade must land on black. */
const SHAPES: Record<Speaker["shape"], { origin: string; node: React.ReactNode }> = {
  flag: {
    origin: "71% 33%",
    node: <polygon fill={BRAND.yellow} points="285,43 621,43 621,378 453,210 285,378" />,
  },
  circle: { origin: "85% 16%", node: <circle cx="545" cy="105" fill={BRAND.cream} r="90" /> },
  triangle: { origin: "26% 39%", node: <polygon fill={BRAND.blue} points="52,49 52,450 447,250" /> },
};

/** A speaker's slot in the 1920 frame: square box, bottom-anchored, measured from the right edge */
type Slot = { size: number; right: number };

/* Two people share the frame shoulder to shoulder, one gets it to themself. Portraits sit on the right so
   cutouts cropped at their right edge (Ciro's) end off-frame. */
const LAYOUTS: Record<number, Slot[]> = {
  1: [{ size: 980, right: -40 }],
  2: [
    { size: 800, right: 394 },
    { size: 800, right: -20 },
  ],
};

/** Assembles in, then keeps drifting. */
function ShapeLayer({ shape, slot, delay }: { shape: Speaker["shape"]; slot: Slot; delay: number }) {
  const { origin, node } = SHAPES[shape];

  return (
    <span
      className="absolute bottom-0 animate-assemble"
      style={{
        animationDelay: `${delay}s`,
        height: slot.size,
        right: slot.right,
        transformOrigin: origin,
        width: slot.size,
      }}
    >
      <span className="block h-full w-full animate-drift" style={{ animationDelay: `${delay + 0.7}s` }}>
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 640 640">
          {node}
        </svg>
      </span>
    </span>
  );
}

/** Rises from below the frame. */
function PersonLayer({ speaker, slot, delay }: { speaker: Speaker; slot: Slot; delay: number }) {
  return (
    <m.img
      alt={speaker.name}
      animate={{ y: 0 }}
      className="absolute bottom-0"
      initial={{ y: "100%" }}
      src={speaker.cutout}
      style={{ height: slot.size, right: slot.right, width: slot.size }}
      transition={{ type: "spring", stiffness: 60, damping: 15, delay }}
    />
  );
}

// ---------------------------------------------------------------------------
// Talk intro — who is about to speak, before (or instead of) the camera
// ---------------------------------------------------------------------------

export function TalkIntro(props: SceneProps<"talk-intro">) {
  const { bg } = useContext(StageContext);
  const index = Math.min(props.params.talk, TALKS.length) - 1;
  const talk = TALKS[index];

  // Over the camera feed it is the talk's lower third
  if (bg === "transparent") {
    return <LowerThird {...props} params={{ title: names(talk), subtitle: talk.title }} />;
  }

  const slots = LAYOUTS[talk.speakers.length] ?? LAYOUTS[2];

  return (
    // Keyed so switching talks live replays the entrance
    <div key={index} className="absolute inset-0">
      {/* Every shape behind every person, so a neighbour's head never sits under someone else's shape */}
      {talk.speakers.map(({ name, shape }, i) => (
        <ShapeLayer key={name} delay={0.1 + i * 0.15} shape={shape} slot={slots[i]} />
      ))}
      {talk.speakers.map((speaker, i) => (
        <PersonLayer key={speaker.name} delay={0.35 + i * 0.2} slot={slots[i]} speaker={speaker} />
      ))}

      <div className="absolute top-0 bottom-0 left-[120px] flex w-[760px] flex-col justify-center">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.4}>
          Charla {index + 1} · {talk.start} – {talk.end}
        </Rise>
        <Rise
          className={`mt-6 leading-[0.98] font-extrabold tracking-[-0.02em] text-balance uppercase ${talk.title.length > 36 ? "text-[78px]" : "text-[100px]"}`}
          delay={0.55}
        >
          {talk.title}
        </Rise>
        <div className="mt-14 flex flex-col gap-8">
          {talk.speakers.map(({ name, role, shape }, i) => (
            <m.div
              key={name}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-6"
              initial={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.6, delay: 0.9 + i * 0.15, ease: EASE_OUT }}
            >
              <span
                className="mt-3 h-[26px] w-[26px] shrink-0 rounded-full"
                style={{ background: SHAPE_FILL[shape] }}
              />
              <span>
                <span className="block text-[50px] leading-none font-extrabold text-[#F5BB03] uppercase">{name}</span>
                <span className="mt-2 block text-[30px] text-[#FBF5E7]/70">{role}</span>
              </span>
            </m.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speakers — the talks block with faces
// ---------------------------------------------------------------------------

export function Speakers({ params }: SceneProps<"speakers">) {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[140px] top-[110px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {params.eyebrow}
        </Rise>
        <Rise className="mt-3 text-[84px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          {params.title}
        </Rise>
      </div>
      <div className="absolute top-[330px] right-[140px] left-[340px] flex flex-col gap-[40px]">
        {TALKS.map((talk, i) => (
          <m.div
            key={talk.title}
            animate={{ opacity: 1, x: 0 }}
            className="flex min-h-[290px] items-center gap-10 border-l-[12px] border-[#F5BB03] bg-[#FBF5E7]/[0.05] py-8 pr-12 pl-10"
            initial={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.6, delay: 0.3 + i * 0.2, ease: EASE_OUT }}
          >
            <span className="w-[200px] shrink-0 text-[64px] font-extrabold text-[#F5BB03] tabular-nums">
              {talk.start}
            </span>
            <div className="flex shrink-0">
              {talk.speakers.map(({ name, picture, shape }, j) => (
                <m.div
                  key={name}
                  animate={{ scale: 1, rotate: 0 }}
                  className={`h-[210px] w-[210px] overflow-hidden rounded-full ring-[8px] ring-black ${j ? "-ml-10" : ""}`}
                  initial={{ scale: 0, rotate: -25 }}
                  style={{ background: SHAPE_FILL[shape] }}
                  transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.55 + i * 0.2 + j * 0.12 }}
                >
                  <img alt={name} className="h-full w-full object-cover" src={picture} />
                </m.div>
              ))}
            </div>
            <div className="min-w-0">
              <Rise className="text-[54px] leading-[1.08] font-bold text-balance" delay={0.6 + i * 0.2}>
                {talk.title}
              </Rise>
              <Rise className="mt-3 text-[36px] text-[#FBF5E7]/65" delay={0.75 + i * 0.2}>
                {names(talk)}
              </Rise>
            </div>
          </m.div>
        ))}
      </div>
    </>
  );
}
