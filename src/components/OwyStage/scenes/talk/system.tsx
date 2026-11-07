"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import type { StickyNote } from "lib/orpc";
import type { HubItem, Labeled } from "lib/owy-stage/talk/deck";
import { eventChannel } from "lib/realtime/channels";
import { readableOn, roomColorFor } from "lib/rooms/palette";

import { BRAND, StageContext, useStageFrame } from "../../Stage";
import { useBoard, useNow } from "../useful";
import { Build, COL_W, Frame, ROW, type LayoutProps } from "./layouts";
import type { LiveProps } from "./live";
import { SKY, Seat } from "./seat";

/**
 * The slides about how the open space and Owy are built and connected: the live grid, the one
 * API and its bus, a pipeline, the wifi that broke, and before/after. Same grid and voices as
 * the rest of the deck (`layouts.tsx`): blue is people, yellow is Owy, Owy keeps his seat.
 */

const CREAM_DIM = "rgba(251,245,231,0.22)";

// ---------------------------------------------------------------------------
// The grid, live: the board of the wall's event; a card that lands while it is up gets a ring
// ---------------------------------------------------------------------------

/** How long a card that just landed keeps its ring. */
const FRESH_MS = 15_000;

/** Cards that appeared after the slide's first load: a pitch, a photo, a staff edit alike. */
function useFresh(tracks: StickyNote[] | undefined): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!tracks) return;
    if (!seen.current) {
      seen.current = new Set(tracks.map((track) => track.id));
      return;
    }
    const known = seen.current;
    const added = tracks.filter((track) => !known.has(track.id)).map((track) => track.id);
    if (!added.length) return;
    for (const id of added) known.add(id);
    setFresh((current) => new Set([...current, ...added]));
  }, [tracks]);
  // ponytail: every ring clears together, FRESH_MS after the last landing; per-card timers if pitches overlap
  useEffect(() => {
    if (!fresh.size) return;
    const id = setTimeout(() => setFresh(new Set()), FRESH_MS);
    return () => clearTimeout(id);
  }, [fresh]);
  return fresh;
}

const RING = `0 0 0 6px ${BRAND.yellow}, 0 0 56px 8px rgba(245,187,3,0.55)`;
const NO_RING = "0 0 0 0px rgba(245,187,3,0), 0 0 0px 0px rgba(245,187,3,0)";

function Card({ note, color, fresh }: { note: StickyNote; color: string; fresh: boolean }) {
  return (
    <m.div
      animate={{ opacity: 1, scale: 1, boxShadow: fresh ? RING : NO_RING }}
      className={`relative flex min-w-0 flex-col justify-center overflow-hidden px-4 py-2 ${fresh ? "z-10" : ""}`}
      initial={fresh ? { opacity: 0, scale: 0.5, boxShadow: RING } : { opacity: 0, scale: 1, boxShadow: NO_RING }}
      style={{ background: color, color: readableOn(color) }}
      transition={{ duration: fresh ? 0.7 : 0.4, ease: EASE_OUT }}
    >
      <p className="line-clamp-2 text-[24px] leading-[1.12] font-bold">{note.title}</p>
      {note.speaker && <p className="mt-1 truncate text-[19px] font-medium opacity-70">{note.speaker}</p>}
    </m.div>
  );
}

/** The pitch's steps, under Owy's face: how to talk to him. */
function How({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((text, i) => (
        <li key={text} className="flex items-baseline gap-4">
          <span className="text-[34px] font-semibold text-[#F5BB03] tabular-nums">{i + 1}</span>
          <span className="text-[34px] leading-[1.15] font-semibold">{text}</span>
        </li>
      ))}
    </ol>
  );
}

export function BoardSlide({ slide, eventId }: LiveProps<"board">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);
  const fresh = useFresh(data?.tracks);
  const rooms = (data?.rooms ?? [])
    .filter((room) => room.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 6);
  const slots = (data?.schedules ?? [])
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 6);
  const empty = !eventId
    ? "Elegí la grilla en la mesa: es el evento del wall."
    : data && !(rooms.length && slots.length)
      ? "Todavía no hay grilla."
      : null;

  return (
    <>
      <Frame sub={slide.sub} title={slide.title}>
        {empty ? (
          <p className="text-[42px] font-medium text-[#FBF5E7]/45">{empty}</p>
        ) : (
          data && (
            <div
              className="grid h-full gap-[6px]"
              style={{
                gridTemplateColumns: `100px repeat(${rooms.length}, minmax(0, 1fr))`,
                gridTemplateRows: `48px repeat(${slots.length}, minmax(0, 1fr))`,
              }}
            >
              <div />
              {rooms.map((room) => (
                <div key={room.id} className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-[16px] w-[16px] shrink-0 rounded-full"
                    style={{ background: roomColorFor(room.id, room.color) }}
                  />
                  <span className="truncate text-[26px] font-semibold">{room.name}</span>
                </div>
              ))}
              {slots.flatMap((slot) => {
                const live = slot.startTime <= now && now < slot.endTime;
                return [
                  <p
                    key={slot.id}
                    className="flex items-center text-[28px] font-semibold tabular-nums"
                    style={{ color: live ? BRAND.yellow : undefined }}
                  >
                    {slot.startTime}
                  </p>,
                  ...rooms.map((room) => {
                    const note = data.tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);
                    return note ? (
                      <Card
                        key={note.id}
                        color={roomColorFor(room.id, room.color)}
                        fresh={fresh.has(note.id)}
                        note={note}
                      />
                    ) : (
                      <div
                        key={`${slot.id}-${room.id}`}
                        className={live ? "bg-[#F5BB03]/[0.12]" : "bg-[#FBF5E7]/[0.05]"}
                      />
                    );
                  }),
                ];
              })}
            </div>
          )
        )}
      </Frame>
      <Seat below={slide.how ? <How steps={slide.how} /> : undefined} />
    </>
  );
}

// ---------------------------------------------------------------------------
// One API, one bus: who writes, the middle, who listens; a pulse crosses it
// ---------------------------------------------------------------------------

/** In content coordinates: three columns, four rows, the middle split in API (top) and bus. */
const HUB = { sideW: 330, coreX: 440, coreW: 300, coreTop: 110, coreH: 330, rowTop: 70, rowGap: 140 } as const;
const hubRow = (i: number) => HUB.rowTop + i * HUB.rowGap;
const API_Y = HUB.coreTop + HUB.coreH * 0.27;
const BUS_Y = HUB.coreTop + HUB.coreH * 0.73;
const WRITER_OUT = HUB.sideW + 16;
const CORE_IN = HUB.coreX - 10;
const CORE_OUT = HUB.coreX + HUB.coreW + 10;
const READER_IN = COL_W - HUB.sideW - 16;
const PULSE_S = 0.6;
const AUTO_PULSE_MS = 2600;

/** One change crossing the hub: from a writer (null = a real one from the board) into the API, out to every reader. */
type Pulse = { id: number; from: number | null };

const toneColor = (item: HubItem) => (item.tone === "owy" ? BRAND.yellow : item.tone === "people" ? SKY : undefined);

function HubRow({ item, align, top }: { item: HubItem; align: "left" | "right"; top: number }) {
  return (
    <div
      className={`absolute -translate-y-1/2 ${align === "right" ? "text-right" : ""}`}
      style={{ top, width: HUB.sideW, left: align === "right" ? 0 : COL_W - HUB.sideW }}
    >
      <p className="text-[38px] leading-[1.05] font-semibold tracking-[-0.02em]" style={{ color: toneColor(item) }}>
        {item.label}
      </p>
      <p className="mt-1 text-[26px] leading-[1.2] font-medium text-[#FBF5E7]/60">{item.detail}</p>
    </div>
  );
}

export function HubSlide({ slide, step, eventId }: LiveProps<"hub">) {
  const { preview } = useContext(StageContext);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const nextId = useRef(0);
  const whole = step >= 2;

  const fire = useCallback((from: number | null) => {
    const id = nextId.current++;
    setPulses((list) => [...list.slice(-4), { id, from }]);
    setTimeout(() => setPulses((list) => list.filter((pulse) => pulse.id !== id)), 2400);
  }, []);

  // Once the whole hub is up, a change crosses it every few seconds, from each writer in turn.
  const writers = slide.writers.length;
  useEffect(() => {
    if (!whole) return;
    let i = 0;
    fire(i++ % writers);
    const id = setInterval(() => fire(i++ % writers), AUTO_PULSE_MS);
    return () => clearInterval(id);
  }, [whole, writers, fire]);
  // And a real one whenever the wall's grid changes.
  useRealtimeChannel(eventId && whole && !preview ? eventChannel(eventId, "sync") : null, (event) => {
    if (event === "card_change" || event === "structure_change") fire(null);
  });
  const last = pulses.at(-1);

  return (
    <>
      <Frame sub={slide.sub} title={slide.title}>
        <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
          {step >= 1 &&
            slide.writers.map((item, i) => (
              <m.line
                key={`w-${item.label}`}
                animate={{ pathLength: 1 }}
                initial={{ pathLength: 0 }}
                stroke={CREAM_DIM}
                strokeWidth={3}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE_OUT }}
                x1={WRITER_OUT}
                x2={CORE_IN}
                y1={hubRow(i)}
                y2={API_Y}
              />
            ))}
          {whole &&
            slide.readers.map((item, i) => (
              <m.line
                key={`r-${item.label}`}
                animate={{ pathLength: 1 }}
                initial={{ pathLength: 0 }}
                stroke={CREAM_DIM}
                strokeWidth={3}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE_OUT }}
                x1={CORE_OUT}
                x2={READER_IN}
                y1={BUS_Y}
                y2={hubRow(i)}
              />
            ))}
          {pulses.map((pulse) => {
            const out = pulse.from === null ? 0 : PULSE_S + 0.15;
            return (
              <g key={pulse.id}>
                {pulse.from !== null && (
                  <m.circle
                    animate={{ cx: CORE_IN, cy: API_Y, opacity: [1, 1, 0] }}
                    fill={BRAND.yellow}
                    initial={{ cx: WRITER_OUT, cy: hubRow(pulse.from), opacity: 1 }}
                    r={10}
                    transition={{ duration: PULSE_S, ease: "easeIn" }}
                  />
                )}
                {slide.readers.map((item, j) => (
                  <g key={item.label}>
                    <m.circle
                      animate={{ cx: READER_IN, cy: hubRow(j), opacity: [0, 1, 1, 0] }}
                      fill={BRAND.yellow}
                      initial={{ cx: CORE_OUT, cy: BUS_Y, opacity: 0 }}
                      r={10}
                      transition={{ duration: PULSE_S, delay: out, ease: "easeOut" }}
                    />
                    <m.circle
                      animate={{ r: [10, 34], opacity: [0.9, 0] }}
                      cx={READER_IN}
                      cy={hubRow(j)}
                      fill="none"
                      initial={{ r: 10, opacity: 0 }}
                      stroke={BRAND.yellow}
                      strokeWidth={3}
                      transition={{ duration: 0.6, delay: out + PULSE_S, ease: "easeOut" }}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>

        {slide.writers.map((item, i) => (
          <Build key={item.label} delay={i * 0.08}>
            <HubRow align="right" item={item} top={hubRow(i)} />
          </Build>
        ))}

        {step >= 1 && (
          <Build>
            <div
              className="absolute flex flex-col border-2 border-[#FBF5E7]/30"
              style={{ left: HUB.coreX, top: HUB.coreTop, width: HUB.coreW, height: HUB.coreH }}
            >
              {slide.core.map((part, i) => (
                <div
                  key={part.label}
                  className={`flex flex-1 flex-col justify-center px-7 ${i > 0 ? "border-t-2 border-[#FBF5E7]/[0.12]" : ""}`}
                >
                  <p className="text-[46px] leading-none font-bold tracking-[-0.03em]">{part.label}</p>
                  <p
                    className="mt-3 font-terminal text-[26px] leading-[1.2]"
                    style={{ color: i > 0 ? BRAND.yellow : "rgba(251,245,231,0.65)" }}
                  >
                    {part.detail}
                  </p>
                </div>
              ))}
            </div>
            {last && (
              <m.div
                key={`flash-${last.id}`}
                animate={{ opacity: [0, 1, 0] }}
                className="pointer-events-none absolute border-[3px] border-[#F5BB03]"
                initial={{ opacity: 0 }}
                style={{ left: HUB.coreX, top: HUB.coreTop, width: HUB.coreW, height: HUB.coreH }}
                transition={{ duration: 0.9, delay: last.from === null ? 0 : PULSE_S - 0.1 }}
              />
            )}
            {last?.from === null && (
              <m.p
                key={`live-${last.id}`}
                animate={{ opacity: [0, 1, 1, 0] }}
                className="absolute font-terminal text-[26px] text-[#F5BB03]"
                initial={{ opacity: 0 }}
                style={{ left: HUB.coreX, top: HUB.coreTop + HUB.coreH + 18 }}
                transition={{ duration: 2.2, times: [0, 0.1, 0.8, 1] }}
              >
                ● en vivo
              </m.p>
            )}
          </Build>
        )}

        {whole &&
          slide.readers.map((item, i) => (
            <Build key={item.label} delay={0.15 + i * 0.08}>
              <HubRow align="left" item={item} top={hubRow(i)} />
            </Build>
          ))}
      </Frame>
      <Seat />
    </>
  );
}

// ---------------------------------------------------------------------------
// A pipeline on a rail: one station per build, the rail lit up to the current one
// ---------------------------------------------------------------------------

const DOT = 30;

export function FlowSlide({ slide, step }: LayoutProps<"flow">) {
  const n = slide.stations.length;
  const now = Math.min(step, n - 1);

  return (
    <>
      <Frame sub={slide.sub} title={slide.title}>
        <div
          className="absolute w-[4px] bg-[#FBF5E7]/[0.12]"
          style={{ left: DOT / 2 - 2, top: `${50 / n}%`, height: `${(100 * (n - 1)) / n}%` }}
        />
        <m.div
          animate={{ height: `${(100 * now) / n}%` }}
          className="absolute w-[4px] bg-[#F5BB03]"
          initial={false}
          style={{ left: DOT / 2 - 2, top: `${50 / n}%` }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
        <div className="absolute inset-0 grid" style={{ gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}>
          {slide.stations.slice(0, now + 1).map((station, i) => {
            const current = i === now;
            return (
              <Build key={station.label} className="flex items-center gap-8" settled={!current}>
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: DOT,
                    height: DOT,
                    background: current ? BRAND.yellow : BRAND.cream,
                    boxShadow: `0 0 0 8px ${BRAND.black}`,
                  }}
                />
                <div className="min-w-0">
                  <p className="text-[44px] leading-[1.05] font-semibold tracking-[-0.02em]">{station.label}</p>
                  <p
                    className="mt-1 font-terminal text-[28px] leading-[1.2]"
                    style={{ color: current ? BRAND.yellow : "rgba(251,245,231,0.6)" }}
                  >
                    {station.detail}
                  </p>
                </div>
              </Build>
            );
          })}
        </div>
      </Frame>
      <Seat />
    </>
  );
}

// ---------------------------------------------------------------------------
// The wifi: packets on a healthy link and on the knob's, with what was measured
// ---------------------------------------------------------------------------

const SEND_MS = 300;
const PACKET = 22;
/** A packet's dice, the same on every frame: [0, 1) from its number. */
const dice = (k: number, salt: number) => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A metaphor, not a measurement: the healthy link crosses steady and fast; the knob's crosses
 * slow and uneven, and two packets in five never arrive (they fade and drop partway).
 */
function Packets({ ok, width }: { ok: boolean; width: number }) {
  const [t, setT] = useState(0);
  useStageFrame((now) => setT(now));
  const travel = (k: number) => (ok ? 1600 : 2600 + dice(k, 1) * 3600);
  const longest = ok ? 1600 : 6200;
  const dots = [];
  for (let k = Math.max(0, Math.floor((t - longest) / SEND_MS)); k <= Math.floor(t / SEND_MS); k++) {
    const p = (t - k * SEND_MS) / travel(k);
    if (p < 0 || p > 1) continue;
    const dies = !ok && dice(k, 2) < 0.4 ? 0.2 + dice(k, 3) * 0.55 : 2;
    const gone = Math.max(0, (p - dies) / 0.1);
    if (gone >= 1) continue;
    dots.push(
      <span
        key={k}
        className="absolute rounded-[5px]"
        style={{
          left: p * (width - PACKET),
          top: (60 - PACKET) / 2 + gone * 34,
          width: PACKET,
          height: PACKET,
          opacity: 1 - gone,
          background: ok ? BRAND.cream : BRAND.yellow,
        }}
      />
    );
  }
  return (
    <div className="relative h-[60px]" style={{ width }}>
      <div className="absolute top-1/2 h-[2px] w-full bg-[#FBF5E7]/[0.18]" />
      {dots}
    </div>
  );
}

export function WifiSlide({ slide, step }: LayoutProps<"wifi">) {
  return (
    <>
      <Frame className="flex flex-col gap-[48px]" sub={slide.sub} title={slide.title}>
        {slide.lanes.slice(0, step + 1).map((lane) => (
          <Build key={lane.label} className={`${ROW} pt-7`}>
            <div className="flex items-baseline justify-between gap-8">
              <p
                className="text-[50px] leading-none font-semibold tracking-[-0.02em]"
                style={{ color: lane.ok ? undefined : BRAND.yellow }}
              >
                {lane.label}
              </p>
              <p className="text-[56px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap tabular-nums">
                {lane.rtt}
                <span className="ml-6 text-[32px] font-medium tracking-normal text-[#FBF5E7]/60">
                  {lane.loss} perdido
                </span>
              </p>
            </div>
            <div className="mt-6">
              <Packets ok={lane.ok} width={COL_W} />
            </div>
          </Build>
        ))}
        {step >= slide.lanes.length - 1 && (
          <Build className="mt-4" delay={0.6}>
            <p className="text-[58px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">{slide.verdict}</p>
          </Build>
        )}
      </Frame>
      <Seat />
    </>
  );
}

// ---------------------------------------------------------------------------
// Before / after: a device and the Mac, and what crosses the wifi between them
// ---------------------------------------------------------------------------

const SPLIT_GAP = 64;
const SIDE_W = (COL_W - SPLIT_GAP) / 2;
const BOX_W = 205;
const WIRE_W = SIDE_W - 2 * BOX_W;

function SplitBox({ label, detail }: Labeled) {
  return (
    <div className="shrink-0 border-2 border-[#FBF5E7]/30 px-4 py-4" style={{ width: BOX_W }}>
      <p className="text-[32px] leading-none font-semibold tracking-[-0.01em]">{label}</p>
      <p className="mt-2 text-[22px] leading-[1.15] font-medium text-[#FBF5E7]/65">{detail}</p>
    </div>
  );
}

/** The wifi between them: a dense stream of audio, or a few dots. */
function Wire({ heavy }: { heavy: boolean }) {
  const dash = heavy ? 12 : 26;
  return (
    <svg aria-hidden className="shrink-0 self-center" height={40} width={WIRE_W}>
      <m.line
        animate={{ strokeDashoffset: [0, -dash] }}
        stroke={heavy ? BRAND.cream : BRAND.yellow}
        strokeDasharray={heavy ? "8 4" : "0.1 26"}
        strokeLinecap={heavy ? "butt" : "round"}
        strokeWidth={heavy ? 12 : 10}
        transition={{ duration: heavy ? 0.18 : 0.9, repeat: Infinity, ease: "linear" }}
        x1={8}
        x2={WIRE_W - 8}
        y1={20}
        y2={20}
      />
    </svg>
  );
}

export function SplitSlide({ slide, step }: LayoutProps<"split">) {
  return (
    <>
      <Frame className="flex items-start" sub={slide.sub} title={slide.title}>
        {slide.sides.slice(0, step + 1).map((side, i) => (
          <Build
            key={side.title}
            className="shrink-0"
            settled={i < step}
            style={{ width: SIDE_W, marginLeft: i ? SPLIT_GAP : 0 }}
          >
            <p
              className="text-[56px] leading-none font-bold tracking-[-0.03em]"
              style={{ color: side.heavy ? undefined : BRAND.yellow }}
            >
              {side.title}
            </p>
            <div className="mt-9 flex items-stretch">
              <SplitBox {...side.device} />
              <Wire heavy={side.heavy} />
              <SplitBox {...side.mac} />
            </div>
            <p
              className="mt-4 text-center font-terminal text-[24px]"
              style={{ color: side.heavy ? "rgba(251,245,231,0.65)" : BRAND.yellow }}
            >
              {side.wire}
            </p>
            <ul className="mt-7">
              {side.facts.map((fact) => (
                <li key={fact} className={`${ROW} py-3 text-[30px] leading-[1.2] font-medium text-[#FBF5E7]/75`}>
                  {fact}
                </li>
              ))}
            </ul>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}
