"use client";

import { Fragment, useContext, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type Room, type Schedule, type StickyNote } from "lib/orpc";
import {
  applyFaceEvent,
  initialFlow,
  nextTick,
  reduceFlow,
  type CardChange,
  type Landed,
} from "lib/owy-stage/face-flow";
import type { SceneProps } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";

import { OwyFace, useFaceEvents, type FaceApi } from "../Face";
import { Ambient, BRAND, Caption, Flag, StageContext, W, useTyped } from "../Stage";

/**
 * Owy at wall scale: the device's own face (the firmware's model and renderer, see Face.tsx),
 * fed by the companion's events through the bridge — its state, the feeling per sentence on the
 * word it belongs to, and its lip shapes — so the wall Owy and the table Owy are one character.
 *
 * Around the face, what the companion is doing: the transcript typing in and, at the open
 * space's marketplace, the pitch it just heard landing on the board as a card.
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

/** `ambient={false}`: the face alone, without the brand shapes around it (the talk deck draws its own). */
export default function OwyFaceScene({
  params,
  eventId,
  ambient = true,
}: SceneProps<"owy-face"> & { ambient?: boolean }) {
  const { preview } = useContext(StageContext);
  const face = useRef<FaceApi>(null);
  const [flow, dispatch] = useReducer(reduceFlow, undefined, initialFlow);
  const captions = params.captions;

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
  const panel = transcript !== null && flow.landed === null && transcript.text.length > 160;
  const aside = panel || flow.landed !== null;

  return (
    <>
      {ambient && <Ambient />}
      <OwyFace
        ref={face}
        className={`absolute transition-transform duration-700 ease-out ${OVER_SHAPES}`}
        size={FACE}
        style={{ left: FACE_X, top: FACE_Y, transform: aside ? `translateX(-${ASIDE_PX}px)` : undefined }}
      />
      <AnimatePresence>
        {transcript && !panel && flow.landed === null && (
          <Caption key={transcript.key} text={transcript.text} who={transcript.who} />
        )}
        {transcript && panel && <PitchPanel key={transcript.key} text={transcript.text} who={transcript.who} />}
        {flow.landed && <LandedCard key={flow.landed.key} card={flow.landed} eventId={eventId} />}
      </AnimatePresence>
    </>
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

type BoardSnapshot = { rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] };

/** The board once, when a card lands (the create already happened, so the new talk is in it). */
function useBoardSnapshot(eventId: string | null) {
  const [data, setData] = useState<BoardSnapshot | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    Promise.all([
      client.rooms.getByOpenSpace({ openSpaceId: eventId }),
      client.schedules.getByOpenSpace({ openSpaceId: eventId }),
      client.tracks.list({ openSpaceId: eventId }),
    ])
      .then(([rooms, schedules, tracks]) => live && setData({ rooms, schedules, tracks }))
      .catch((error) => console.error("[stage] board", error));
    return () => {
      live = false;
    };
  }, [eventId]);

  return data;
}

const sameName = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The talk that just landed, as a sticky note in its room's colour, with its place on a mini board. */
function LandedCard({ card, eventId }: { card: Landed; eventId: string | null }) {
  const board = useBoardSnapshot(eventId);
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
function MiniBoard({ board, roomId, scheduleId }: { board: BoardSnapshot; roomId: string; scheduleId: string }) {
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
