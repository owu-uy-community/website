"use client";

import { Fragment, useContext, useEffect, useReducer, useRef } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import {
  applyFaceEvent,
  initialFlow,
  nextTick,
  reduceFlow,
  type CardChange,
  type Landed,
} from "lib/owy-stage/face-flow";
import type { SceneId, SceneProps } from "lib/owy-stage/scenes";
import {
  NO_SPOT,
  SPOT_FLY_MS,
  SPOT_IN_MS,
  cellBox,
  flyTo,
  phaseMs,
  rowWindow,
  spotting,
  type Box,
  type Phase,
  type Queued,
} from "lib/owy-stage/spotlight";
import { eventChannel } from "lib/realtime/channels";
import { readableOn, roomColorFor } from "lib/rooms/palette";

import { OwyFace, useFaceEvents, type FaceApi } from "../Face";
import { Ambient, BRAND, Caption, Flag, StageContext, W, useTyped } from "../Stage";
import { useBoard } from "../board";
import { useSpotlights } from "../spotlights";
import { useNow } from "./parts";

/**
 * Owy at wall scale: the device's own face (the firmware's model and renderer, see Face.tsx),
 * fed by the companion's events through the bridge — its state, the feeling per sentence on the
 * word it belongs to, and its lip shapes — so the wall Owy and the table Owy are one character.
 *
 * Around the face, what the companion is doing: the transcript typing in and, at the open
 * space's marketplace, the pitch it just heard landing on the board as a card.
 *
 * «Owy y la grilla» (owy-board) is the same scene with the live grid beside her: the face glides
 * to the corner and keeps talking in a bubble, and every new talk (or one the desk picks) comes up
 * as a big sticky over the blurred grid, holds long enough to read, and flies to its cell.
 */

/** The knob's face at ×2.46 (466-space ×1.9), centred, with room under it for the captions. */
const FACE = 886;
const FACE_X = (W - FACE) / 2;
const FACE_Y = 40;
/**
 * Over the brand shapes: the device's black screen lets them through (lighten keeps the
 * brighter of the two), and over the black wall every pixel is the device's own.
 */
export const OVER_SHAPES = "mix-blend-lighten";
/** The face where every wall scene puts it (owy-says, owy-talks). */
export const WALL_FACE = {
  size: FACE,
  className: `absolute ${OVER_SHAPES}`,
  style: { left: FACE_X, top: FACE_Y },
} as const;

/** The face slides left to make room for the pitch panel or the landed card. */
const ASIDE_PX = 380;

/** Beside the grid: the face in the bottom-right corner, the bubble over it. */
const CORNER = { x: 1448, y: 612, size: 424 };
const RAIL = { x: 1440, w: 432, bottom: 1080 - 596 };
/** The grid's box on «Owy y la grilla», its header column and row, and the gap between cells. */
const GRID: Box = { x: 56, y: 132, w: 1344, h: 904 };
const HEAD = { w: 116, h: 56 };
const GAP = 6;
const MAX_ROOMS = 6;
const MAX_ROWS = 6;
/** The sticky, centred over the grid. */
const STICKY: Box = { x: GRID.x + GRID.w / 2 - 440, y: GRID.y + GRID.h / 2 - 260, w: 880, h: 520 };
/** The face's glide between the middle and the corner; the grid waits for it before a sticky comes in. */
const MORPH = { duration: 1.1, ease: [0.65, 0, 0.35, 1] as const };
const BOARD_IN_MS = 1200;

/** `ambient={false}`: the face alone, without the brand shapes around it (the talk deck draws its own). */
export default function OwyFaceScene({
  params,
  eventId,
  scene = "owy-face",
  ambient = true,
}: SceneProps<"owy-face" | "owy-board"> & { scene?: SceneId; ambient?: boolean }) {
  const { preview } = useContext(StageContext);
  const face = useRef<FaceApi>(null);
  const [flow, dispatch] = useReducer(reduceFlow, undefined, initialFlow);
  const [spots, spot] = useReducer(spotting, NO_SPOT);
  const captions = params.captions;
  const board = scene === "owy-board";

  useFaceEvents({
    face: (event, now) => {
      if (face.current) applyFaceEvent(face.current, event);
      dispatch({ type: "face", face: event, now, captions });
    },
    mouth: (frames, at) => face.current?.mouth(frames, at),
    level: (level) => face.current?.level(level),
    smile: () => face.current?.smile(),
  });
  // The board's own event for a new card: it lands even if the companion's post never arrives.
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "sync") : null, (event, payload) => {
    if (event === "card_change") dispatch({ type: "card_change", change: payload as CardChange, now: Date.now() });
  });

  // Spotlights line up whatever is on (the take that brings the board can arrive just after
  // them); they play on the board, once the face has reached its corner.
  useSpotlights((heard) => spot({ type: "heard", spot: heard, now: Date.now() }));
  const boardAt = useRef(0);
  useEffect(() => {
    boardAt.current = board ? Date.now() : 0;
    if (!board) spot({ type: "drop" });
  }, [board]);
  const waiting = spots.current === null && spots.queue.length > 0;
  useEffect(() => {
    if (!board || !waiting) return;
    const id = setTimeout(
      () => spot({ type: "next", now: Date.now() }),
      Math.max(0, boardAt.current + BOARD_IN_MS - Date.now())
    );
    return () => clearTimeout(id);
  }, [board, waiting]);
  const current = spots.current;
  const ms = current ? phaseMs(spots.phase, current.track) : null;
  useEffect(() => {
    if (ms === null) return;
    const id = setTimeout(() => spot({ type: "step", now: Date.now() }), ms);
    return () => clearTimeout(id);
  }, [current, spots.phase, ms]);
  // Owy is glad of every talk she shows.
  useEffect(() => {
    if (current) face.current?.smile();
  }, [current]);

  // Captions linger long enough to be read, then clear; every update extends the timer.
  useEffect(() => {
    const transcript = flow.transcript;
    if (!transcript) return;
    const id = setTimeout(
      () => dispatch({ type: "clear_transcript", key: transcript.key }),
      6000 + transcript.text.length * 40
    );
    return () => clearTimeout(id);
  }, [flow.transcript]);

  // The card leaves on the wall clock.
  useEffect(() => {
    const at = nextTick(flow);
    if (at === null) return;
    const id = setTimeout(() => dispatch({ type: "tick", now: Date.now() }), Math.max(30, at - Date.now()));
    return () => clearTimeout(id);
  }, [flow]);

  // Subtitles switched off mid-sentence leave at once, not when the caption would have timed out.
  const transcript = captions ? flow.transcript : null;
  // Beside the grid, the spotlight shows new talks: the landed card stays for the full face.
  const landed = board ? null : flow.landed;
  const panel = !board && transcript !== null && landed === null && transcript.text.length > 160;
  const aside = panel || landed !== null;
  const at = board
    ? { x: CORNER.x, y: CORNER.y, scale: CORNER.size / FACE }
    : { x: FACE_X - (aside ? ASIDE_PX : 0), y: FACE_Y, scale: 1 };

  return (
    <>
      <AnimatePresence initial={false}>
        {ambient && !board && (
          <m.div
            key="ambient"
            animate={{ opacity: 1 }}
            className="absolute inset-0"
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <Ambient />
          </m.div>
        )}
        {board && (
          <BoardSide
            key="board"
            current={current}
            eventId={eventId}
            hint={"hint" in params ? params.hint : ""}
            phase={spots.phase}
            transcript={transcript}
          />
        )}
      </AnimatePresence>
      {/* The canvas keeps its size (a new size restarts the face's worker): the move is a transform. */}
      <m.div
        animate={at}
        className={`absolute top-0 left-0 ${OVER_SHAPES}`}
        initial={false}
        style={{ width: FACE, height: FACE, transformOrigin: "0 0" }}
        transition={MORPH}
      >
        <OwyFace ref={face} size={FACE} />
      </m.div>
      <AnimatePresence>
        {transcript && !board && !panel && landed === null && (
          <Caption key={transcript.key} text={transcript.text} who={transcript.who} />
        )}
        {transcript && panel && <PitchPanel key={transcript.key} text={transcript.text} who={transcript.who} />}
        {landed && <LandedCard key={landed.key} card={landed} eventId={eventId} />}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// «Owy y la grilla»: the live grid, Owy's bubble over her corner, the spotlight
// ---------------------------------------------------------------------------

type Transcript = { key: string; who: "input" | "output"; text: string };

function BoardSide({
  eventId,
  hint,
  transcript,
  current,
  phase,
}: {
  eventId: string | null;
  hint: string;
  transcript: Transcript | null;
  current: Queued | null;
  phase: Phase;
}) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);
  const dim = current !== null && (phase === "in" || phase === "hold");

  const rooms = (data?.rooms ?? []).filter((room) => room.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const shownRooms = rooms.slice(0, MAX_ROOMS);
  // filter() makes the copy that sort() orders: OBS 30's Chromium 103 has no toSorted.
  const day = (data?.schedules ?? [])
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const on = day.findIndex((slot) => now < slot.endTime);
  const target = current ? day.findIndex((slot) => slot.id === current.track.scheduleId) : null;
  const from = rowWindow(day.length, MAX_ROWS, on < 0 ? day.length : on, target);
  const slots = day.slice(from, from + MAX_ROWS);

  // Where the sticky goes back to: its cell, if the grid shows it; else it fades where it is.
  const col = current ? shownRooms.findIndex((room) => room.id === current.track.roomId) : -1;
  const row = current ? slots.findIndex((slot) => slot.id === current.track.scheduleId) : -1;
  const cell =
    col >= 0 && row >= 0
      ? cellBox(GRID, HEAD, GAP, { cols: shownRooms.length, rows: slots.length }, { col, row })
      : null;

  return (
    <m.div
      animate={{ opacity: 1 }}
      className="absolute inset-0"
      exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeIn" } }}
      initial={{ opacity: 0 }}
      // In once the face has nearly reached its corner: it never glides over the grid.
      transition={{ duration: 0.7, delay: 0.7, ease: EASE_OUT }}
    >
      <m.div
        animate={dim ? { filter: "blur(14px) brightness(0.45)" } : { filter: "blur(0px) brightness(1)" }}
        className="absolute inset-0"
        initial={false}
        transition={{ duration: (dim ? SPOT_IN_MS : SPOT_FLY_MS) / 1000, ease: dim ? EASE_OUT : MORPH.ease }}
      >
        <div
          className="absolute flex items-end justify-between"
          style={{ left: GRID.x, top: 40, width: GRID.w, height: GRID.y - 40 - 28 }}
        >
          <h2 className="text-[52px] leading-none font-extrabold tracking-[-0.02em] uppercase">
            Grilla del open space
          </h2>
          {data && (
            <p className="text-[26px] leading-none font-semibold tracking-[0.2em] text-[#F5BB03] uppercase">
              {data.tracks.length} {data.tracks.length === 1 ? "sesión" : "sesiones"}
            </p>
          )}
        </div>
        {!eventId ? (
          <GridNote text="Elegí un evento en el admin" />
        ) : data && (!shownRooms.length || !slots.length) ? (
          <GridNote text="Todavía no hay grilla" />
        ) : (
          data && (
            <BoardGrid
              current={current}
              phase={phase}
              rooms={shownRooms}
              slots={slots}
              now={now}
              tracks={data.tracks}
            />
          )
        )}
      </m.div>
      <p
        className="absolute text-right text-[64px] leading-none font-extrabold text-[#FBF5E7] tabular-nums"
        style={{ left: RAIL.x, top: 40, width: RAIL.w }}
      >
        {now}
      </p>
      <AnimatePresence mode="wait">
        {transcript ? (
          <Bubble key={transcript.key} text={transcript.text} who={transcript.who} />
        ) : (
          hint && <HintCard key="hint" text={hint} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {current && phase !== "land" && (
          <Spotlit key={current.id} cell={cell} flying={phase === "fly"} spot={current} />
        )}
      </AnimatePresence>
    </m.div>
  );
}

function GridNote({ text }: { text: string }) {
  return (
    <p
      className="absolute flex items-center justify-center text-center text-[48px] font-extrabold text-[#FBF5E7]/40 uppercase"
      style={{ left: GRID.x, top: GRID.y, width: GRID.w, height: GRID.h }}
    >
      {text}
    </p>
  );
}

/** Rooms across, blocks down; the spotlight's cell stays empty until its sticky lands there, then glows. */
function BoardGrid({
  rooms,
  slots,
  tracks,
  now,
  current,
  phase,
}: {
  rooms: Room[];
  slots: Schedule[];
  tracks: StickyNote[];
  now: string;
  current: Queued | null;
  phase: Phase;
}) {
  const reveal = (SPOT_FLY_MS / 1000) * 0.8;

  return (
    <div
      className="absolute grid"
      style={{
        left: GRID.x,
        top: GRID.y,
        width: GRID.w,
        height: GRID.h,
        gap: GAP,
        gridTemplateColumns: `${HEAD.w}px repeat(${rooms.length}, minmax(0, 1fr))`,
        gridTemplateRows: `${HEAD.h}px repeat(${slots.length}, minmax(0, 1fr))`,
      }}
    >
      <div />
      {rooms.map((room) => (
        <div key={room.id} className="flex min-w-0 items-center justify-center gap-3 bg-[#FBF5E7]/[0.08] px-3">
          <span
            className="h-[16px] w-[16px] shrink-0 rounded-full"
            style={{ background: roomColorFor(room.id, room.color) }}
          />
          <span className="truncate text-[24px] font-extrabold uppercase">{room.name}</span>
        </div>
      ))}
      {slots.map((slot) => {
        const live = slot.startTime <= now && now < slot.endTime;

        return (
          <Fragment key={slot.id}>
            <div
              className={`flex flex-col items-center justify-center ${live ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.08]"}`}
            >
              <span className="text-[28px] leading-none font-extrabold tabular-nums">{slot.startTime}</span>
              <span className={`mt-1 text-[18px] tabular-nums ${live ? "text-black/70" : "text-[#FBF5E7]/50"}`}>
                {slot.endTime}
              </span>
            </div>
            {rooms.map((room) => {
              const here = current?.track.roomId === room.id && current.track.scheduleId === slot.id;
              const found = tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);
              // The spotlight's talk, even before the board's own update brings it.
              const note =
                here && phase !== "fly" && phase !== "land" ? undefined : (found ?? (here ? current.track : undefined));
              const color = roomColorFor(room.id, room.color);

              return (
                <m.div
                  key={room.id}
                  animate={here && phase === "land" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  className={`relative ${here ? "z-10" : ""} ${live ? "bg-[#F5BB03]/15" : "bg-[#FBF5E7]/[0.04]"}`}
                  initial={false}
                  transition={{ duration: 0.9, ease: EASE_OUT }}
                >
                  {note ? (
                    <m.div
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex flex-col justify-center overflow-hidden px-4 py-2"
                      initial={here ? { opacity: 0 } : false}
                      style={{ background: color, color: readableOn(color) }}
                      transition={{ delay: here ? reveal : 0, duration: 0.25 }}
                    >
                      <p className="line-clamp-3 text-[24px] leading-[1.1] font-bold">{note.title}</p>
                      {note.speaker && <p className="mt-1 truncate text-[18px] opacity-70">{note.speaker}</p>}
                    </m.div>
                  ) : (
                    <p className="absolute inset-0 flex items-center justify-center text-[20px] text-[#FBF5E7]/25">
                      libre
                    </p>
                  )}
                  {here && phase === "land" && (
                    <m.span
                      animate={{ opacity: [0, 1, 1, 0] }}
                      className="pointer-events-none absolute -inset-[6px] border-[5px] border-[#FBF5E7]"
                      initial={{ opacity: 0 }}
                      transition={{ duration: 1.6, times: [0, 0.12, 0.7, 1] }}
                    />
                  )}
                </m.div>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The talk as last year's sticky, in its room's colour: it lands in front of the blurred grid,
 * holds, then (`flying`) shrinks into its cell — or, with no cell on screen, fades where it is.
 */
function Spotlit({ spot, cell, flying }: { spot: Queued; cell: Box | null; flying: boolean }) {
  const { track } = spot;
  const color = roomColorFor(track.roomId, track.roomColor);
  const ink = readableOn(color);
  const start = track.timeSlot.split(" - ")[0];
  // A short title fills the sticky; a long one still fits in three lines.
  const size = track.title.length <= 24 ? 100 : track.title.length <= 48 ? 72 : 62;
  const to = cell ? flyTo(STICKY, cell) : { x: 0, y: 40, scale: 0.9 };

  return (
    <m.div
      animate={
        flying
          ? { ...to, rotate: 0, opacity: cell ? [1, 1, 0] : 0 }
          : { x: 0, y: 0, scale: 1, rotate: -2.5, opacity: 1 }
      }
      className="absolute"
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      initial={{ x: 0, y: 160, scale: 0.7, rotate: -9, opacity: 0 }}
      style={{
        left: STICKY.x,
        top: STICKY.y,
        width: STICKY.w,
        height: STICKY.h,
        filter: "drop-shadow(0 34px 50px rgba(0,0,0,0.55))",
      }}
      transition={
        flying
          ? {
              duration: SPOT_FLY_MS / 1000,
              ease: MORPH.ease,
              opacity: { duration: SPOT_FLY_MS / 1000, times: [0, 0.82, 1] },
            }
          : { type: "spring", bounce: 0.28, duration: SPOT_IN_MS / 1000 }
      }
    >
      <div
        className="flex h-full w-full flex-col px-[64px] pt-[56px] pb-[48px]"
        style={{
          background: color,
          color: ink,
          clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 72px), calc(100% - 72px) 100%, 0 100%)",
        }}
      >
        <p className="text-[24px] font-bold tracking-[0.22em] uppercase opacity-70">
          {spot.how === "manual" ? "Destacada" : "Nueva charla"}
        </p>
        {/* Between the tag and the place, in the middle of what is left. */}
        <div className="my-auto py-4">
          <h2
            className="line-clamp-3 leading-[1.02] font-black tracking-[-0.02em] text-balance"
            style={{ fontSize: size }}
          >
            {track.title}
          </h2>
          {track.speaker && <p className="mt-4 truncate text-[38px] font-semibold opacity-85">{track.speaker}</p>}
        </div>
        <p className="text-[40px] font-extrabold">→ {[track.room, start].filter(Boolean).join(" · ")}</p>
      </div>
      {/* The dog-ear and the tape that holds it up. */}
      <div
        className="absolute right-0 bottom-0 h-[72px] w-[72px]"
        style={{ background: color, clipPath: "polygon(0 0, 100% 0, 0 100%)", filter: "brightness(0.78)" }}
      />
      <div className="absolute -top-[26px] left-1/2 h-[56px] w-[200px] -translate-x-1/2 rotate-[3deg] bg-[#FBF5E7]/60" />
    </m.div>
  );
}

/** What Owy (or whoever talks to her) is saying, in a bubble over her corner: the tail, typed in. */
function Bubble({ text, who }: { text: string; who: "input" | "output" }) {
  const shown = text.length > 220 ? `…${text.slice(-220)}` : text;
  const typed = useTyped(shown);
  const owy = who === "output";

  return (
    <m.div
      animate={{ y: 0, opacity: 1, scale: 1 }}
      className="absolute origin-bottom"
      exit={{ y: 12, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } }}
      initial={{ y: 24, opacity: 0, scale: 0.96 }}
      style={{ left: RAIL.x, bottom: RAIL.bottom, width: RAIL.w }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div
        className="rounded-[28px] px-8 py-6"
        style={{ background: owy ? BRAND.cream : BRAND.blue, color: owy ? "#111111" : BRAND.cream }}
      >
        <p className="line-clamp-7 text-[30px] leading-[1.2] font-semibold">
          {!owy && <span className="mr-3 opacity-70">›</span>}
          {typed}
        </p>
      </div>
      <div
        className="mx-auto h-[18px] w-[36px]"
        style={{ background: owy ? BRAND.cream : BRAND.blue, clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
      />
    </m.div>
  );
}

/** While Owy is quiet: how to get a talk on the grid. */
function HintCard({ text }: { text: string }) {
  return (
    <m.div
      animate={{ y: 0, opacity: 1 }}
      className="absolute flex items-start gap-5 border-l-[10px] border-[#F5BB03] bg-[#FBF5E7]/[0.07] px-7 py-6"
      exit={{ y: 12, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } }}
      initial={{ y: 24, opacity: 0 }}
      style={{ left: RAIL.x, bottom: RAIL.bottom + 18, width: RAIL.w }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT }}
    >
      <Flag className="mt-1 h-[40px] w-[40px] shrink-0" fill={BRAND.yellow} />
      <p className="text-[30px] leading-[1.2] font-semibold text-balance text-[#FBF5E7]">{text}</p>
    </m.div>
  );
}

/** A long transcript (a pitch) beside the face instead of the lower third: the tail, typed in. */
function PitchPanel({ text, who }: { text: string; who: "input" | "output" }) {
  const { bg } = useContext(StageContext);
  const shown = text.length > 700 ? `…${text.slice(-700)}` : text;
  const typed = useTyped(shown);
  const accent = who === "input" ? BRAND.blue : BRAND.yellow;

  return (
    <m.div
      animate={{ x: 0, opacity: 1 }}
      className="absolute top-[120px] right-[96px] flex w-[760px] items-start gap-6"
      exit={{ x: 24, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
      initial={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <Flag className="mt-2 h-[56px] w-[56px] shrink-0" fill={accent} />
      <p
        className="text-[34px] leading-[1.2] font-semibold tracking-[-0.01em] text-[#FBF5E7]"
        style={bg === "transparent" ? { textShadow: "0 2px 24px rgba(0,0,0,0.85)" } : undefined}
      >
        {typed}
      </p>
    </m.div>
  );
}

const sameName = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The talk that just landed, as a sticky note in its room's colour, with its place on a mini board. */
function LandedCard({ card, eventId }: { card: Landed; eventId: string | null }) {
  const { preview } = useContext(StageContext);
  // Live, so the cell the new talk took (and any taken since) shows as taken.
  const board = useBoard(eventId, preview);
  const room =
    board?.rooms.find((candidate) => candidate.id === card.roomId) ??
    board?.rooms.find((candidate) => sameName(candidate.name, card.room));
  const slot =
    board?.schedules.find((candidate) => candidate.id === card.scheduleId) ??
    board?.schedules.find((candidate) => `${candidate.startTime} - ${candidate.endTime}` === card.timeSlot);
  const color = roomColorFor(room?.id ?? card.roomId ?? "", card.roomColor ?? room?.color);
  const start = card.timeSlot?.split(" - ")[0];

  return (
    <m.div
      animate={{ opacity: 1 }}
      className="absolute top-[110px] right-[96px] flex w-[720px] flex-col gap-6"
      exit={{ opacity: 0, y: 20, transition: { duration: 0.4, ease: "easeIn" } }}
      initial={{ opacity: 0 }}
    >
      <m.div
        animate={{ scale: 1, y: 0, opacity: 1, rotate: 1.5 }}
        className="rounded-[28px] px-10 py-8 text-[#1F1F1F] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        initial={{ scale: 0.6, y: 120, opacity: 0, rotate: -6 }}
        style={{ background: color }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <p className="text-[20px] font-semibold tracking-[0.18em] uppercase opacity-70">Nueva charla</p>
        <h2 className="mt-2 line-clamp-2 text-[46px] leading-[1.05] font-black tracking-[-0.02em] text-balance">
          {card.title}
        </h2>
        {card.speaker && <p className="mt-3 text-[30px] font-semibold">{card.speaker}</p>}
        {(card.room || start) && (
          <p className="mt-5 text-[34px] font-bold">→ {[card.room, start].filter(Boolean).join(" · ")}</p>
        )}
        {card.reasoning && <p className="mt-3 line-clamp-2 text-[20px] leading-snug opacity-75">{card.reasoning}</p>}
      </m.div>
      {board && room && slot && <MiniBoard board={board} roomId={room.id} scheduleId={slot.id} />}
    </m.div>
  );
}

/** Rooms across, blocks down, the landed cell pulsing in its room's colour. */
function MiniBoard({
  board,
  roomId,
  scheduleId,
}: {
  board: { rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] };
  roomId: string;
  scheduleId: string;
}) {
  const rooms = board.rooms.filter((room) => room.isActive).slice(0, 6);
  // filter() makes the copy that sort() orders: OBS 30's Chromium 103 has no toSorted.
  const all = board.schedules.filter((slot) => slot.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const at = Math.max(
    0,
    all.findIndex((slot) => slot.id === scheduleId)
  );
  const from = Math.max(0, Math.min(at - 2, all.length - 5));
  const slots = all.slice(from, from + 5);
  const taken = new Set(board.tracks.map((track) => `${track.roomId}|${track.scheduleId}`));

  return (
    <m.div
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] bg-black/40 p-5 backdrop-blur"
      initial={{ opacity: 0, y: 24 }}
      transition={{ delay: 0.5, duration: 0.5, ease: EASE_OUT }}
    >
      <div className="grid gap-2" style={{ gridTemplateColumns: `88px repeat(${rooms.length}, minmax(0, 1fr))` }}>
        <div />
        {rooms.map((room) => (
          <div key={room.id} className="truncate text-center text-[16px] font-semibold text-[#FBF5E7]/80">
            {room.name}
          </div>
        ))}
        {slots.map((slot) => (
          <Fragment key={slot.id}>
            <div className="self-center text-[16px] font-semibold text-[#FBF5E7]/70">{slot.startTime}</div>
            {rooms.map((room) => {
              const here = room.id === roomId && slot.id === scheduleId;
              const busy = taken.has(`${room.id}|${slot.id}`);

              return (
                <m.div
                  key={room.id}
                  animate={here ? { scale: [1, 1.12, 1] } : undefined}
                  className="h-[44px] rounded-[10px]"
                  style={{
                    background: here || busy ? roomColorFor(room.id, room.color) : "rgba(251,245,231,0.08)",
                    opacity: here ? 1 : busy ? 0.4 : 1,
                  }}
                  transition={here ? { duration: 0.9, repeat: 2, delay: 0.8 } : undefined}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </m.div>
  );
}
