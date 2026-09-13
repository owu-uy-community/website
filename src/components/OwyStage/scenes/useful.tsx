"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type Room, type Schedule, type StickyNote } from "lib/orpc";
import type { SceneProps } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Ambient, BRAND, Flag, H, StageContext, W, useStageFrame } from "../Stage";
import { drawFace, initialSim } from "./OwyFace";
import { QrCode, Rise, nowHHMM } from "./parts";

// ---------------------------------------------------------------------------
// Program items — "HH:MM Título | HH:MM Título" typed by staff in the admin
// ---------------------------------------------------------------------------

export type ProgramItem = { time: string; title: string };

export function parseProgram(items: string): ProgramItem[] {
  return items
    .split("|")
    .map((item) => item.trim().match(/^(\d{1,2}:\d{2})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ time: match[1].padStart(5, "0"), title: match[2].trim() }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Index of the item running now (the last one that already started). */
function currentIndex(program: ProgramItem[], now: string): number {
  let index = -1;
  program.forEach((item, i) => {
    if (item.time <= now) index = i;
  });
  return index;
}

function useNow(everyMs = 1000) {
  const [now, setNow] = useState(nowHHMM);
  useEffect(() => {
    const id = setInterval(() => setNow(nowHHMM()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Seconds from now (HH:MM:SS in the event timezone) until an HH:MM today. */
function secondsUntil(time: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  const nowSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  const [h, m] = time.split(":").map(Number);
  return h * 3600 + m * 60 - nowSeconds;
}

export function Program({ params }: SceneProps<"program">) {
  const program = useMemo(() => parseProgram(params.items), [params.items]);
  const now = useNow(15_000);
  const current = currentIndex(program, now);

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[120px] top-[90px] flex items-end justify-between">
        <div>
          <Rise className="text-[26px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
            {params.title}
          </Rise>
          <Rise className="mt-2 text-[72px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
            El día
          </Rise>
        </div>
        <p className="pb-2 text-[40px] font-semibold text-[#FBF5E7]/60 tabular-nums">{now}</p>
      </div>
      {/* Chronological down the column; a second column only when the day has many blocks */}
      <m.ol
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-[120px] top-[290px] grid grid-flow-col gap-x-[80px] gap-y-[18px]"
        initial={{ opacity: 0, y: 24 }}
        style={{
          gridTemplateRows: `repeat(${Math.ceil(program.length / (program.length > 7 ? 2 : 1))}, auto)`,
          gridTemplateColumns: program.length > 7 ? "1fr 1fr" : "1fr",
        }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
      >
        {program.map((item, i) => {
          const isNow = i === current;
          const past = i < current;
          return (
            <li
              key={`${item.time}-${item.title}`}
              className={`flex items-center gap-8 border-l-[10px] px-7 py-5 ${
                isNow
                  ? "border-[#F5BB03] bg-[#FBF5E7]/[0.08]"
                  : past
                    ? "border-[#FBF5E7]/10 opacity-40"
                    : "border-[#FBF5E7]/25"
              }`}
            >
              <span className={`w-[150px] text-[44px] font-extrabold tabular-nums ${isNow ? "text-[#F5BB03]" : ""}`}>
                {item.time}
              </span>
              <span className="text-[36px] leading-tight font-semibold">{item.title}</span>
              {isNow && (
                <span className="ml-auto shrink-0 bg-[#F5BB03] px-3 py-1 text-[18px] font-bold tracking-[0.2em] text-black uppercase">
                  Ahora
                </span>
              )}
            </li>
          );
        })}
      </m.ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Next — "volvemos en MM:SS" computed from the program, no admin fiddling
// ---------------------------------------------------------------------------

export function Next({ params }: SceneProps<"next">) {
  const program = useMemo(() => parseProgram(params.items), [params.items]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const upcoming = program
    .map((item) => ({ ...item, seconds: secondsUntil(item.time) }))
    .filter((item) => item.seconds > 0);
  const next = upcoming[0];
  void tick;

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[210px] text-center">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#FBF5E7]/60 uppercase" delay={0.05}>
          {next ? params.label : "Por hoy"}
        </Rise>
        <div className="countdown-font mt-2 text-[400px] leading-none tracking-wider text-[#F5BB03] select-none">
          {next ? formatTime(Math.min(next.seconds, 5999)) : "FIN"}
        </div>
        <Rise className="text-[64px] font-extrabold tracking-[-0.01em] uppercase" delay={0.3}>
          {next ? `${next.time} · ${next.title}` : "Gracias por venir"}
        </Rise>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Room — one room's day, for a screen at that room's door
// ---------------------------------------------------------------------------

function useBoard(eventId: string | null, preview: boolean) {
  const [data, setData] = useState<{ rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] } | null>(null);
  const load = useCallback(() => {
    if (!eventId) return;
    Promise.all([
      client.rooms.getByOpenSpace({ openSpaceId: eventId }),
      client.schedules.getByOpenSpace({ openSpaceId: eventId }),
      client.tracks.list({ openSpaceId: eventId }),
    ])
      .then(([rooms, schedules, tracks]) => setData({ rooms, schedules, tracks }))
      .catch((error) => console.error("[stage] board", error));
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "sync") : null, (event) => {
    if (event === "card_change") load();
  });
  return data;
}

export function RoomDay({ params, eventId }: SceneProps<"room">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;

  const wanted = params.room.trim().toLowerCase();
  const room = data.rooms.find((candidate) => candidate.name.trim().toLowerCase() === wanted);
  if (!room) {
    return (
      <EmptyText
        text={`Sala "${params.room}" no existe · ${data.rooms
          .filter((candidate) => candidate.isActive)
          .map((candidate) => candidate.name)
          .join(" · ")}`}
      />
    );
  }

  const color = roomColorFor(room.id, room.color);
  const slots = data.schedules.filter((slot) => slot.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <>
      <div className="absolute inset-y-0 left-0 w-[40px]" style={{ background: color }} />
      <div className="absolute top-[90px] left-[140px] flex items-end gap-10">
        <div>
          <Rise className="text-[26px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
            Sala
          </Rise>
          <Rise className="mt-2 text-[96px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
            {room.name}
          </Rise>
        </div>
        <p className="pb-3 text-[40px] font-semibold text-[#FBF5E7]/60 tabular-nums">{now}</p>
      </div>
      <m.ul
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-[140px] top-[290px] flex flex-col gap-[14px]"
        initial={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
      >
        {slots.slice(0, 7).map((slot) => {
          const note = data.tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);
          const isNow = slot.startTime <= now && now < slot.endTime;
          const past = slot.endTime <= now;
          return (
            <li
              key={slot.id}
              className={`flex items-center gap-10 border-l-[10px] px-8 py-4 ${
                isNow
                  ? "border-[#F5BB03] bg-[#FBF5E7]/[0.08]"
                  : past
                    ? "border-[#FBF5E7]/10 opacity-40"
                    : "border-[#FBF5E7]/25"
              }`}
            >
              <span className={`w-[260px] text-[38px] font-extrabold tabular-nums ${isNow ? "text-[#F5BB03]" : ""}`}>
                {slot.startTime} – {slot.endTime}
              </span>
              {note ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[40px] leading-tight font-bold">{note.title}</span>
                  {note.speaker && <span className="block text-[26px] text-[#FBF5E7]/65">{note.speaker}</span>}
                </span>
              ) : (
                <span className="text-[32px] text-[#FBF5E7]/30">libre</span>
              )}
            </li>
          );
        })}
      </m.ul>
    </>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <>
      <Ambient />
      <p className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center text-[56px] font-extrabold text-[#FBF5E7]/40 uppercase">
        {text}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cast bar — lower third that follows whatever is cast from the open space
// ---------------------------------------------------------------------------

export function CastBar({ eventId }: SceneProps<"cast-bar">) {
  const { preview } = useContext(StageContext);
  const [note, setNote] = useState<StickyNote | null>(null);

  useEffect(() => {
    if (!eventId) return;
    client.cast
      .getState({ eventId })
      .then((state) => setNote(state.note))
      .catch((error) => console.error("[stage] cast", error));
  }, [eventId]);
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "cast") : null, (event, payload) => {
    if (event === "note_highlighted") setNote((payload as { note: StickyNote | null }).note);
  });

  return (
    <AnimatePresence>
      {note && (
        <m.div
          key={note.id}
          animate={{ x: 0, opacity: 1 }}
          className="absolute bottom-[110px] left-[120px] flex items-stretch"
          exit={{ x: -60, opacity: 0, transition: { duration: 0.4, ease: "easeIn" } }}
          initial={{ x: -80, opacity: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <div className="w-[26px]" style={{ background: roomColorFor(note.roomId, note.roomColor) }} />
          <div className="bg-black px-12 py-7 pr-20">
            <p className="text-[54px] leading-none font-extrabold tracking-[-0.01em]">{note.title}</p>
            <p className="mt-3 text-[28px] font-medium text-[#FBF5E7]/75">
              {[note.speaker, note.room, note.timeSlot].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Flag className="-ml-[2px] h-[60px] w-[60px] self-start" fill={BRAND.yellow} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// WiFi — the card everyone photographs on arrival
// ---------------------------------------------------------------------------

export function Wifi({ params }: SceneProps<"wifi">) {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[260px] top-[180px] border-[8px] border-[#FBF5E7] p-[70px]">
        <div className="flex items-center gap-8">
          <svg
            className="h-[90px] w-[90px]"
            fill="none"
            stroke={BRAND.yellow}
            strokeLinecap="round"
            strokeWidth="9"
            viewBox="0 0 100 100"
          >
            <path d="M12 42a55 55 0 0 1 76 0" />
            <path d="M26 58a33 33 0 0 1 48 0" />
            <path d="M40 74a12 12 0 0 1 20 0" />
            <circle cx="50" cy="84" fill={BRAND.yellow} r="5" stroke="none" />
          </svg>
          <Rise className="text-[40px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
            WiFi
          </Rise>
        </div>
        <Rise className="mt-10 text-[34px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase" delay={0.15}>
          Red
        </Rise>
        <Rise className="mt-1 text-[110px] leading-none font-extrabold tracking-[-0.02em]" delay={0.25}>
          {params.network}
        </Rise>
        <Rise className="mt-10 text-[34px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase" delay={0.35}>
          Contraseña
        </Rise>
        <Rise className="font-terminal mt-1 text-[110px] leading-none tracking-[0.08em] text-[#F5BB03]" delay={0.45}>
          {params.password}
        </Rise>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Alert — an announcement that cannot be missed
// ---------------------------------------------------------------------------

const STRIPES = "repeating-linear-gradient(135deg, #F5BB03 0 60px, #000 60px 120px)";

export function Alert({ params }: SceneProps<"alert">) {
  return (
    <>
      <m.div
        animate={{ backgroundPositionX: ["0px", "170px"] }}
        className="absolute inset-x-0 top-0 h-[70px]"
        style={{ backgroundImage: STRIPES }}
        transition={{ duration: 2, ease: "linear", repeat: Infinity }}
      />
      <m.div
        animate={{ backgroundPositionX: ["170px", "0px"] }}
        className="absolute inset-x-0 bottom-0 h-[70px]"
        style={{ backgroundImage: STRIPES }}
        transition={{ duration: 2, ease: "linear", repeat: Infinity }}
      />
      <div
        key={`${params.title}|${params.body}`}
        className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center"
      >
        <m.div
          animate={{ scale: [1, 1.06, 1] }}
          className="mx-auto mb-10 flex h-[120px] w-[120px] items-center justify-center bg-[#F5BB03] text-[84px] font-extrabold text-black"
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          !
        </m.div>
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Aviso
        </Rise>
        <Rise
          className="mt-4 text-[130px] leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase"
          delay={0.15}
        >
          {params.title}
        </Rise>
        {params.body && (
          <Rise className="mt-8 text-[46px] font-medium text-balance text-[#FBF5E7]/85" delay={0.4}>
            {params.body}
          </Rise>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Steps — a numbered how-to
// ---------------------------------------------------------------------------

function StepList({ steps, delay = 0.3 }: { steps: string[]; delay?: number }) {
  return (
    <ol className="flex flex-col gap-[34px]">
      {steps.map((step, i) => (
        <m.li
          key={`${i}-${step}`}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-10"
          initial={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.6, delay: delay + i * 0.15, ease: EASE_OUT }}
        >
          <span
            className="flex h-[110px] w-[110px] shrink-0 items-center justify-center rounded-full text-[56px] font-extrabold text-black"
            style={{ background: i % 2 ? BRAND.blue : BRAND.yellow, color: i % 2 ? BRAND.cream : "#000" }}
          >
            {i + 1}
          </span>
          <span className="text-[46px] leading-[1.15] font-semibold text-balance">{step}</span>
        </m.li>
      ))}
    </ol>
  );
}

export function Steps({ params }: SceneProps<"steps">) {
  const steps = [params.step1, params.step2, params.step3, params.step4].map((step) => step.trim()).filter(Boolean);

  return (
    <>
      <Ambient />
      <div className="absolute top-[110px] left-[120px] w-[560px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Cómo funciona
        </Rise>
        <Rise
          className="mt-4 text-[100px] leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase"
          delay={0.2}
        >
          {params.title}
        </Rise>
      </div>
      <div className="absolute top-[130px] right-[120px] w-[1040px]">
        <StepList steps={steps} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Owy how-to — the face explains the marketplace table
// ---------------------------------------------------------------------------

const OWY_STEPS = [
  "Buscá a Owy en la mesa del mercado de ideas",
  "Tocalo y contale qué charla querés proponer",
  "Owy la anota y la ubica en la grilla del open space",
  "Mirá la pantalla: tu idea ya tiene sala y horario",
];

export function OwyHowTo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef(initialSim());
  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // Every so often Owy smiles at the reader.
    if (Math.floor(t / 9000) !== Math.floor((t - dt) / 9000)) sim.current.happyUntil = t + 2200;
    drawFace(ctx, sim.current, t, dt);
  });

  return (
    <>
      <Ambient />
      {/* The face is drawn at the frame's centre; shift the canvas so it sits on the left half */}
      <canvas ref={canvas} className="absolute inset-0 -translate-x-[440px] scale-[0.78]" height={H} width={W} />
      <div className="absolute top-[110px] right-[120px] w-[980px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Open Space
        </Rise>
        <Rise className="mt-3 text-[96px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          Hablá con Owy
        </Rise>
        <div className="mt-12">
          <StepList delay={0.5} steps={OWY_STEPS} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Social — where to find us
// ---------------------------------------------------------------------------

export function Social({ params }: SceneProps<"social">) {
  const link = /^https?:\/\//i.test(params.url) ? params.url : `https://${params.url}`;

  return (
    <>
      <Ambient />
      <div className="absolute top-[200px] left-[140px] w-[1180px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#FBF5E7]/60 uppercase" delay={0.05}>
          Sumate a la comunidad
        </Rise>
        <Rise
          className="mt-6 text-[170px] leading-none font-extrabold tracking-[-0.03em] text-[#F5BB03] uppercase"
          delay={0.15}
        >
          {params.hashtag}
        </Rise>
        <Rise className="mt-10 text-[64px] font-bold tracking-[-0.01em]" delay={0.35}>
          {params.url}
        </Rise>
        {params.line && (
          <Rise className="mt-6 text-[40px] font-medium text-[#FBF5E7]/75" delay={0.5}>
            {params.line}
          </Rise>
        )}
      </div>
      <m.div
        animate={{ opacity: 1, scale: 1 }}
        className="absolute top-[300px] right-[160px]"
        initial={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT }}
      >
        <QrCode size={400} value={link} />
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Photo — 3, 2, 1, flash
// ---------------------------------------------------------------------------

export function Photo({ params }: SceneProps<"photo">) {
  const { preview } = useContext(StageContext);
  const [n, setN] = useState(params.seconds);
  useEffect(() => {
    setN(params.seconds);
    if (preview) return;
    const id = setInterval(() => setN((value) => (value <= 0 ? 0 : value - 1)), 1000);
    return () => clearInterval(id);
  }, [params.seconds, preview]);
  const shot = n <= 0;

  return (
    <>
      <Ambient />
      <Rise
        className="absolute inset-x-0 top-[150px] text-center text-[72px] font-extrabold tracking-[-0.01em] uppercase"
        delay={0.05}
      >
        {shot ? "¡Gracias!" : "Foto grupal · mirá a la cámara"}
      </Rise>
      <AnimatePresence mode="popLayout">
        {shot ? (
          <m.div key="shot" animate={{ opacity: 1 }} className="absolute inset-0" initial={{ opacity: 0 }}>
            <m.div
              animate={{ opacity: 0 }}
              className="absolute inset-0 bg-[#FBF5E7]"
              initial={{ opacity: 1 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
            <div className="countdown-font absolute inset-0 flex items-center justify-center text-[420px] leading-none text-[#F5BB03]">
              📸
            </div>
          </m.div>
        ) : (
          <m.div
            key={n}
            animate={{ scale: 1, opacity: 1 }}
            className="countdown-font absolute inset-0 flex items-center justify-center text-[700px] leading-none text-[#F5BB03]"
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.3, ease: "easeIn" } }}
            initial={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            {n}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
