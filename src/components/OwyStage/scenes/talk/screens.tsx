"use client";

import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { Callout } from "lib/owy-stage/talk/deck";

import { BRAND } from "../../Stage";
import { Build, COL_W, Frame, type LayoutProps } from "./layouts";
import { Seat } from "./seat";

/**
 * Screenshots of the real thing. A screen shows whole for one click (where we are), then each
 * click moves the camera onto one callout: the rest dims, a yellow line marks it, and its words
 * sit under Owy's face. Phones stand side by side, one per click. The pictures are 2× captures,
 * so a 3× zoom still reads from the back of the room.
 */

/** The screen's frame on the slide: 16:9, as wide as the content column allows under a short title. */
const VIEW_W = 1160;
const VIEW_H = Math.round((VIEW_W * 9) / 16);
/** How much of the frame a callout fills, and the camera's limits. */
const FILL = 0.82;
const MAX_ZOOM = 3.2;
const CAMERA = { duration: 0.95, ease: [0.65, 0, 0.35, 1] } as const;

/** The camera for a callout, in fractions of the frame: scale, then the offset that centres the box without leaving an edge. */
export function cameraFor(box: Callout["box"] | null) {
  if (!box) return { scale: 1, x: 0, y: 0 };
  const [bx, by, bw, bh] = box;
  const scale = Math.max(1, Math.min(MAX_ZOOM, FILL / bw, FILL / bh));
  const clamp = (offset: number) => Math.min(0, Math.max(1 - scale, offset));
  return { scale, x: clamp(0.5 - scale * (bx + bw / 2)), y: clamp(0.5 - scale * (by + bh / 2)) };
}

function CalloutCard({ callout, n, of }: { callout: Callout; n: number; of: number }) {
  return (
    <m.div
      key={n}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col"
      initial={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, delay: 0.35, ease: EASE_OUT }}
    >
      <div className="flex items-center gap-4">
        <span className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full bg-[#F5BB03] text-[28px] font-bold text-black tabular-nums">
          {n}
        </span>
        <span className="text-[26px] font-medium text-[#FBF5E7]/50 tabular-nums">
          {n} de {of}
        </span>
      </div>
      <p className="mt-5 text-[44px] leading-[1.06] font-semibold tracking-[-0.02em] text-balance">{callout.title}</p>
      <p className="mt-3 text-[31px] leading-[1.25] font-medium text-[#FBF5E7]/72">{callout.body}</p>
    </m.div>
  );
}

export function ScreenSlide({ slide, step }: LayoutProps<"screen">) {
  const index = Math.min(step, slide.callouts.length) - 1;
  const callout = index >= 0 ? slide.callouts[index] : null;
  const camera = cameraFor(callout?.box ?? null);
  const tv = slide.frame === "tv";

  return (
    <>
      <Frame gap={36} size={72} sub={slide.sub} title={slide.title}>
        <div
          className={`relative overflow-hidden ${tv ? "rounded-[18px] border-[12px] border-[#1C1C1C]" : "rounded-[14px] border-2 border-[#FBF5E7]/[0.16]"}`}
          style={{ width: VIEW_W, height: VIEW_H, boxSizing: "content-box" }}
        >
          <m.div
            animate={{ scale: camera.scale, x: camera.x * VIEW_W, y: camera.y * VIEW_H }}
            className="absolute top-0 left-0"
            initial={false}
            style={{ width: VIEW_W, height: VIEW_H, originX: 0, originY: 0 }}
            transition={CAMERA}
          >
            <img alt={slide.title} className="h-full w-full" src={slide.shot} />
            {callout && (
              <m.div
                key={index}
                animate={{ opacity: 1 }}
                className="absolute rounded-[6px]"
                initial={{ opacity: 0 }}
                style={{
                  left: `${callout.box[0] * 100}%`,
                  top: `${callout.box[1] * 100}%`,
                  width: `${callout.box[2] * 100}%`,
                  height: `${callout.box[3] * 100}%`,
                  // The rest of the screen dims; the line keeps its width at any zoom.
                  boxShadow: `0 0 0 ${4 / camera.scale}px ${BRAND.yellow}, 0 0 0 4000px rgba(0,0,0,0.64)`,
                }}
                transition={{ duration: 0.4, delay: 0.55, ease: EASE_OUT }}
              />
            )}
          </m.div>
        </div>
      </Frame>
      <Seat below={callout ? <CalloutCard callout={callout} n={index + 1} of={slide.callouts.length} /> : undefined} />
    </>
  );
}

/** A phone: the capture behind glass, its screen's own proportions (390 × 844). */
const PHONE_H = 520;
const PHONE_W = Math.round((PHONE_H * 390) / 844);
const PHONE_COL = 340;

export function PhonesSlide({ slide, step }: LayoutProps<"phones">) {
  const shown = Math.min(step + 1, slide.phones.length);
  const gap = Math.min(80, (COL_W - slide.phones.length * PHONE_COL) / Math.max(1, slide.phones.length - 1));

  return (
    <>
      <Frame className="flex items-start justify-center" gap={40} size={72} sub={slide.sub} title={slide.title}>
        {slide.phones.slice(0, shown).map((phone, i) => (
          <Build
            key={phone.shot}
            className="flex shrink-0 flex-col items-center"
            settled={i < shown - 1}
            style={{ width: PHONE_COL, marginLeft: i ? gap : 0 }}
          >
            <div className="overflow-hidden rounded-[38px] border-[10px] border-[#1C1C1C] bg-black">
              <img alt={phone.title} className="block" src={phone.shot} style={{ width: PHONE_W, height: PHONE_H }} />
            </div>
            <p className="mt-6 text-center text-[40px] leading-[1.05] font-semibold tracking-[-0.02em]">
              {phone.title}
            </p>
            <p className="mt-2 text-center text-[28px] leading-[1.25] font-medium text-balance text-[#FBF5E7]/68">
              {phone.body}
            </p>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}
