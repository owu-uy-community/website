"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";

import { usePlayUrl } from "../../inputs";
import { BRAND, useTyped } from "../../Stage";
import { QrCode } from "../parts";
import { MiniFace, isTalking, useFeed } from "./feed";

/**
 * The talk's visual system. Two voices: blue is people (questions, votes, Agustín), yellow is
 * Owy (his words, his marks); colour always says who, never decorates. Owy has a seat, the right
 * column of every content slide, where he listens, thinks and his words appear under his face.
 */

/** Brand blue on black is too dark for text; this is the same blue, lit for reading. */
export const SKY = "#7DB3F2";

/** Owy's mark: the brand half-circle, dome up. Big, it is the chair he sits on. */
export function OwyMark({
  className,
  style,
  fill = BRAND.yellow,
}: {
  className?: string;
  style?: CSSProperties;
  fill?: string;
}) {
  return (
    <svg aria-hidden className={className} style={style} viewBox="0 0 100 50">
      <path d="M0 50 A50 50 0 0 1 100 50 Z" fill={fill} />
    </svg>
  );
}

/** The people's mark: the brand triangle, pointing at what they say. */
export function PeopleMark({
  className,
  style,
  fill = BRAND.blue,
}: {
  className?: string;
  style?: CSSProperties;
  fill?: string;
}) {
  return (
    <svg aria-hidden className={className} style={style} viewBox="0 0 100 100">
      <polygon fill={fill} points="0,0 100,50 0,100" />
    </svg>
  );
}

/** Whether Owy's subtitles show (the console's «Sin subtítulos» turns them off): set once for the deck. */
export const CaptionsContext = createContext(true);

/** The right column every content slide leaves to Owy. */
export const SEAT_X = 1380;
export const SEAT_W = 420;

/**
 * The frame's vertical zones. Slide content ends at `CONTENT_BOTTOM`, the section name sits under
 * it; where Owy speaks along the bottom (`CaptionLine`) the slide keeps clear of `CAPTION_TOP`.
 */
export const CONTENT_BOTTOM = 930;
export const CAPTION_TOP = 820;
/** Owy's chair (the half-circle) starts here: nothing of the seat may reach it. */
const CHAIR_TOP = 830;

/**
 * What Owy or the room is saying right now, typed; blue for the question, yellow for Owy. Live
 * words are read from the end: the box holds `lines` lines and is anchored to its bottom, so a
 * long answer scrolls up out of it a whole line at a time and the newest words always show.
 */
export function Said({ size = 36, lines, className = "" }: { size?: number; lines: number; className?: string }) {
  const { flow, state } = useFeed();
  const transcript = flow.transcript;
  // The whole running transcript: it only ever grows, so typing continues instead of restarting.
  const typed = useTyped(transcript?.text ?? "");
  if (!transcript) {
    return (
      <p className={`font-medium text-[#FBF5E7]/55 ${className}`} style={{ fontSize: size }}>
        {state === "listening" ? "Escuchando…" : state === "thinking" ? "Pensando…" : ""}
      </p>
    );
  }
  const input = transcript.who === "input";
  const lineHeight = 1.25;

  return (
    <div
      className={`flex flex-col justify-end overflow-hidden ${className}`}
      style={{ maxHeight: Math.ceil(lines * size * lineHeight) }}
    >
      <p
        className="shrink-0 font-semibold tracking-[-0.01em]"
        style={{ fontSize: size, lineHeight, color: input ? SKY : BRAND.yellow }}
      >
        {typed}
      </p>
    </div>
  );
}

/** The phone QR, quiet: how to reach Owy (or vote) from the seat. */
export function AskOwy({ label, size = 168 }: { label: string; size?: number }) {
  const url = usePlayUrl();
  return (
    <div className="flex flex-col items-center text-center">
      <QrCode size={size} value={url} />
      <p className="mt-5 text-[34px] leading-none font-semibold">{label}</p>
      <p className="mt-3 text-[26px] font-medium text-[#FBF5E7]/55">{url.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}

/**
 * Owy's seat: his face, and under it what he hears and says while a turn runs; when he is quiet,
 * how to ask him (or `below`, a slide's own footnote). `pinned` stays under the face either way
 * (who answers, in the Q&A). `chair` sits him on his half-circle. The column has a fixed height:
 * whatever is under the face is clamped to it, so it can never reach the chair or the footer.
 */
export function Seat({
  label = "Preguntale a Owy",
  below,
  pinned,
  chair = false,
}: {
  label?: string | null;
  below?: ReactNode;
  pinned?: ReactNode;
  chair?: boolean;
}) {
  const { flow, state } = useFeed();
  // Without subtitles the seat keeps what it shows when Owy is quiet; his face still talks.
  const talking = useContext(CaptionsContext) && (isTalking(state) || flow.transcript !== null);
  const rest = below ?? (label ? <AskOwy label={label} /> : null);
  const top = 150;
  const bottom = (chair ? CHAIR_TOP : CONTENT_BOTTOM) - 30;

  return (
    <>
      {chair && (
        <OwyMark className="absolute h-[250px] w-[500px]" style={{ left: SEAT_X + SEAT_W / 2 - 250, top: CHAIR_TOP }} />
      )}
      <div
        className="absolute flex flex-col items-center overflow-hidden"
        style={{ left: SEAT_X, top, width: SEAT_W, height: bottom - top }}
      >
        <MiniFace className="shrink-0" size={340} />
        {pinned && <div className="mt-8 w-full shrink-0">{pinned}</div>}
        <div className="mt-8 min-h-0 w-full flex-1">
          <AnimatePresence initial={false} mode="wait">
            <m.div
              key={talking ? "said" : "rest"}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {talking ? <Said lines={pinned || chair ? 5 : 7} /> : rest}
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

/**
 * Owy's words along the bottom, for the slides where his face is part of the picture: above the
 * section name, never over it. `right` keeps it off Owy's chair where he sits on one.
 */
export function CaptionLine({ right = 120 }: { right?: number }) {
  const { flow } = useFeed();
  const captions = useContext(CaptionsContext);
  return (
    <AnimatePresence>
      {captions && flow.transcript && (
        <m.div
          key={flow.transcript.key}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-[110px] left-[120px] flex items-start gap-6 bg-black py-5 pr-8 pl-6"
          style={{ right }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {flow.transcript.who === "input" ? (
            <PeopleMark className="mt-2 h-[34px] w-[34px] shrink-0" />
          ) : (
            <OwyMark className="mt-4 h-[22px] w-[44px] shrink-0" />
          )}
          <Said className="min-w-0 flex-1" lines={2} size={42} />
        </m.div>
      )}
    </AnimatePresence>
  );
}
