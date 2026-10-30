"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { TEAM_2026 } from "app/conf/components/Team";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type Room, type Schedule, type StickyNote } from "lib/orpc";
import type { SceneProps } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";

import { Confetti } from "../effects";
import { Ambient, BRAND, Flag, H, StageContext, W, useStageFrame } from "../Stage";
import { DATE_LABEL, LogoReveal, MOMENT_PHOTOS, Rise, SponsorRow, nowHHMM } from "./parts";

// ---------------------------------------------------------------------------
// Agenda — the open-space grid, current block first, live
// ---------------------------------------------------------------------------

const AGENDA_ROWS = 3;

export function Agenda({ params, eventId }: SceneProps<"agenda">) {
  const { preview } = useContext(StageContext);
  const [data, setData] = useState<{ rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] } | null>(null);
  const [now, setNow] = useState(nowHHMM);

  const load = useCallback(() => {
    if (!eventId) return;
    Promise.all([
      client.rooms.getByOpenSpace({ openSpaceId: eventId }),
      client.schedules.getByOpenSpace({ openSpaceId: eventId }),
      client.tracks.list({ openSpaceId: eventId }),
    ])
      .then(([rooms, schedules, tracks]) => setData({ rooms, schedules, tracks }))
      .catch((error) => console.error("[stage] agenda", error));
  }, [eventId]);

  useEffect(() => {
    load();
    const id = setInterval(() => setNow(nowHHMM()), 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Any board change (admin, kiosk, Owy) re-reads the grid.
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "sync") : null, (event) => {
    if (event === "card_change" || event === "structure_change") load();
  });

  const view = useMemo(() => {
    if (!data) return null;
    const rooms = data.rooms.filter((room) => room.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const slots = data.schedules
      .filter((schedule) => schedule.isActive)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    // Start at the block running now (or the next one); once the day is over, show the tail.
    let first = slots.findIndex((slot) => slot.endTime > now);
    if (first < 0) first = Math.max(0, slots.length - AGENDA_ROWS);
    const visible = slots.slice(first, first + AGENDA_ROWS);
    const current = slots.find((slot) => slot.startTime <= now && now < slot.endTime)?.id;
    const heading = current
      ? "Ahora"
      : slots.some((slot) => slot.startTime > now)
        ? "Próximos bloques"
        : "El open space de hoy";
    return { rooms, visible, current, heading };
  }, [data, now]);

  if (!eventId) return <Empty text="Elegí un evento en el admin" />;
  if (!view || view.rooms.length === 0 || view.visible.length === 0)
    return <Empty text="La grilla todavía no está armada" />;

  const noteAt = (roomId: string, slot: Schedule) =>
    data!.tracks.find((track) => track.roomId === roomId && track.scheduleId === slot.id);

  return (
    <>
      <div className="absolute inset-x-[120px] top-[90px] flex items-end justify-between">
        <div>
          <Rise className="text-[26px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
            {params.title}
          </Rise>
          <Rise className="mt-2 text-[72px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
            {view.heading}
          </Rise>
        </div>
        <m.p
          animate={{ opacity: 1 }}
          className="pb-2 text-[40px] font-semibold text-[#FBF5E7]/60 tabular-nums"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.4 }}
        >
          {now}
        </m.p>
      </div>

      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-[120px] top-[290px] grid gap-x-[18px] gap-y-[14px]"
        initial={{ opacity: 0, y: 30 }}
        style={{ gridTemplateColumns: `200px repeat(${view.rooms.length}, minmax(0, 1fr))` }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
      >
        <div />
        {view.rooms.map((room) => (
          <div key={room.id} className="flex items-center gap-3 pb-2 text-[26px] font-bold tracking-[0.06em] uppercase">
            <span
              className="h-[18px] w-[18px] shrink-0 rounded-full"
              style={{ background: roomColorFor(room.id, room.color) }}
            />
            <span className="truncate">{room.name}</span>
          </div>
        ))}

        {view.visible.map((slot) => {
          const isNow = slot.id === view.current;
          return (
            <div key={slot.id} className="contents">
              <div
                className={`flex h-[210px] flex-col justify-center border-l-[10px] pl-5 ${isNow ? "border-[#F5BB03]" : "border-[#FBF5E7]/20"}`}
              >
                <span
                  className={`text-[38px] leading-none font-extrabold tabular-nums ${isNow ? "text-[#F5BB03]" : ""}`}
                >
                  {slot.startTime}
                </span>
                <span className="mt-2 text-[22px] font-medium text-[#FBF5E7]/55 tabular-nums">{slot.endTime}</span>
                {isNow && (
                  <span className="mt-3 w-fit bg-[#F5BB03] px-2 py-0.5 text-[16px] font-bold tracking-[0.2em] text-black uppercase">
                    En curso
                  </span>
                )}
              </div>
              {view.rooms.map((room) => {
                const note = noteAt(room.id, slot);
                const color = roomColorFor(room.id, room.color);
                return (
                  <div
                    key={room.id}
                    className={`flex h-[210px] flex-col justify-between overflow-hidden p-5 ${isNow ? "bg-[#FBF5E7]/[0.08]" : "bg-[#FBF5E7]/[0.03]"}`}
                    style={{ boxShadow: note ? `inset 0 6px 0 ${color}` : undefined }}
                  >
                    {note ? (
                      <>
                        <p className="line-clamp-3 text-[28px] leading-[1.15] font-bold">{note.title}</p>
                        {note.speaker && <p className="truncate text-[21px] text-[#FBF5E7]/65">{note.speaker}</p>}
                      </>
                    ) : (
                      <p className="text-[21px] text-[#FBF5E7]/25">libre</p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </m.div>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <>
      <Ambient />
      <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[64px] font-extrabold text-[#FBF5E7]/40 uppercase">
        {text}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Moments — Ken Burns over the La Meetup III photos
// ---------------------------------------------------------------------------

const PHOTOS = MOMENT_PHOTOS;
const PANS = [
  { from: { x: -30, y: 0 }, to: { x: 30, y: -10 } },
  { from: { x: 20, y: -20 }, to: { x: -25, y: 10 } },
  { from: { x: 0, y: 25 }, to: { x: 15, y: -25 } },
  { from: { x: -20, y: -15 }, to: { x: 25, y: 20 } },
];

export function Moments({ params }: SceneProps<"moments">) {
  const [index, setIndex] = useState(0);
  const seconds = params.secondsPerPhoto;

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % PHOTOS.length), seconds * 1000);
    return () => clearInterval(id);
  }, [seconds]);

  // Warm the next photo so the crossfade never shows a blank frame.
  useEffect(() => {
    const next = new Image();
    next.src = PHOTOS[(index + 1) % PHOTOS.length];
  }, [index]);

  const pan = PANS[index % PANS.length];

  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-black">
        <AnimatePresence>
          <m.img
            key={index}
            alt=""
            animate={{ opacity: 1, scale: 1.16, x: pan.to.x, y: pan.to.y }}
            className="absolute inset-0 h-full w-full object-cover"
            exit={{ opacity: 0, transition: { duration: 1.2, ease: "easeInOut" } }}
            initial={{ opacity: 0, scale: 1.06, x: pan.from.x, y: pan.from.y }}
            src={PHOTOS[index]}
            transition={{
              opacity: { duration: 1.2, ease: "easeInOut" },
              scale: { duration: seconds + 1.5, ease: "linear" },
              x: { duration: seconds + 1.5, ease: "linear" },
              y: { duration: seconds + 1.5, ease: "linear" },
            }}
          />
        </AnimatePresence>
        <div className="absolute inset-x-0 bottom-0 h-[360px] bg-gradient-to-t from-black/85 to-transparent" />
      </div>
      <div className="absolute bottom-[80px] left-[120px] flex items-end gap-8">
        <Flag className="h-[72px] w-[72px]" fill={BRAND.yellow} />
        <div>
          <p className="text-[26px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">Momentos</p>
          <p className="mt-1 text-[52px] leading-none font-extrabold tracking-[-0.02em] uppercase">
            La Meetup III · 2025
          </p>
        </div>
      </div>
      <img alt="OWU CONF" className="absolute right-[120px] bottom-[86px] w-[360px]" src="/images/logos/conf.webp" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Lower third — speaker bar for the camera feed (use with ?bg=transparent)
// ---------------------------------------------------------------------------

export function LowerThird({ params }: SceneProps<"lower-third">) {
  return (
    <m.div
      key={`${params.title}|${params.subtitle}`}
      animate={{ x: 0, opacity: 1 }}
      className="absolute bottom-[110px] left-[120px] flex items-stretch"
      initial={{ x: -80, opacity: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <div className="w-[26px] bg-[#F5BB03]" />
      <div className="bg-black px-12 py-7 pr-20">
        <Rise className="text-[58px] leading-none font-extrabold tracking-[-0.01em]" delay={0.25}>
          {params.title}
        </Rise>
        {params.subtitle && (
          <Rise className="mt-3 text-[30px] font-medium text-[#FBF5E7]/75" delay={0.45}>
            {params.subtitle}
          </Rise>
        )}
      </div>
      <Flag className="-ml-[2px] h-[60px] w-[60px] self-start" fill={BRAND.blue} />
    </m.div>
  );
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

const CLOCK_DATE = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Montevideo",
});

export function Clock({ params }: SceneProps<"clock">) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [hh, mm] = nowHHMM().split(":");

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[250px] text-center">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#FBF5E7]/60 uppercase" delay={0.05}>
          {CLOCK_DATE.format(now)}
        </Rise>
        <div className="countdown-font mt-2 text-[440px] leading-none tracking-wider text-[#F5BB03] select-none">
          {hh}
          <span className="animate-blink">:</span>
          {mm}
        </div>
        {params.label && (
          <Rise className="mt-2 text-[56px] font-extrabold tracking-[-0.01em] uppercase" delay={0.3}>
            {params.label}
          </Rise>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Closing — thanks, confetti bursts and the sponsors
// ---------------------------------------------------------------------------

export function Closing({ params }: SceneProps<"closing">) {
  const { preview } = useContext(StageContext);
  const [bursts, setBursts] = useState<number[]>([]);

  useEffect(() => {
    if (preview) return;
    const fire = () => setBursts((list) => [...list.slice(-2), Date.now()]);
    const first = setTimeout(fire, 900);
    const id = setInterval(fire, 4500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [preview]);

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[160px] top-[190px] text-center">
        <Rise
          className="text-[190px] leading-none font-extrabold tracking-[-0.03em] text-[#F5BB03] uppercase"
          delay={0.1}
        >
          {params.title}
        </Rise>
        {params.subtitle && (
          <Rise className="mt-6 text-[52px] font-medium text-[#FBF5E7]/85" delay={0.45}>
            {params.subtitle}
          </Rise>
        )}
      </div>
      <div className="absolute top-[560px] left-[660px]">
        <LogoReveal className="!w-[600px]" delay={0.7} />
      </div>
      <m.div
        animate={{ opacity: 1 }}
        className="absolute inset-x-0 bottom-[70px]"
        initial={{ opacity: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        <SponsorRow height={80} />
      </m.div>
      <div className="pointer-events-none absolute inset-0">
        {bursts.map((id) => (
          <Confetti key={id} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shapes — generative screensaver with the brand geometry
// ---------------------------------------------------------------------------

type Shape = {
  x: number;
  y: number;
  size: number;
  kind: 0 | 1 | 2 | 3 | 4;
  color: string;
  depth: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  phase: number;
};

const SHAPE_COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];

function makeShapes(count: number): Shape[] {
  return Array.from({ length: count }, (_, i) => {
    const depth = 0.35 + Math.random() * 0.65;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      size: (60 + Math.random() * 180) * depth,
      kind: (i % 5) as Shape["kind"],
      color: SHAPE_COLORS[i % 3],
      depth,
      vx: (Math.random() - 0.5) * 24 * depth,
      vy: (Math.random() - 0.5) * 18 * depth,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.25,
      phase: Math.random() * Math.PI * 2,
    };
  });
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  const s = shape.size;
  ctx.fillStyle = shape.color;
  ctx.beginPath();
  switch (shape.kind) {
    case 0: // ◀ triangle
      ctx.moveTo(-s / 2, -s / 2);
      ctx.lineTo(s / 2, 0);
      ctx.lineTo(-s / 2, s / 2);
      break;
    case 1: // circle
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      break;
    case 2: // notched flag
      ctx.moveTo(-s / 2, -s / 2);
      ctx.lineTo(s / 2, -s / 2);
      ctx.lineTo(s / 2, s / 2);
      ctx.lineTo(0, s * 0.22);
      ctx.lineTo(-s / 2, s / 2);
      break;
    case 3: // half circle
      ctx.arc(0, s / 4, s / 2, Math.PI, 0);
      break;
    default: // diamond
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, 0);
      ctx.lineTo(0, s / 2);
      ctx.lineTo(-s / 2, 0);
  }
  ctx.closePath();
  ctx.fill();
}

export function Shapes() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shapes = useMemo(() => makeShapes(30).sort((a, b) => a.depth - b.depth), []);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const shape of shapes) {
      shape.x += shape.vx * s;
      shape.y += (shape.vy + Math.sin(t / 2600 + shape.phase) * 10 * shape.depth) * s;
      shape.rot += shape.vrot * s;
      const margin = shape.size;
      if (shape.x < -margin) shape.x = W + margin;
      if (shape.x > W + margin) shape.x = -margin;
      if (shape.y < -margin) shape.y = H + margin;
      if (shape.y > H + margin) shape.y = -margin;

      ctx.save();
      ctx.globalAlpha = 0.18 + shape.depth * 0.75;
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.rot);
      drawShape(ctx, shape);
      ctx.restore();
    }
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <m.img
        alt="OWU CONF"
        animate={{ opacity: 0.9 }}
        className="absolute right-[120px] bottom-[80px] w-[420px]"
        initial={{ opacity: 0 }}
        src="/images/logos/conf.webp"
        transition={{ delay: 0.8, duration: 1 }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Team — credits roll
// ---------------------------------------------------------------------------

const TEAM_LOOP = [...TEAM_2026, ...TEAM_2026];

export function Team() {
  return (
    <>
      <Ambient />
      <div className="absolute top-[200px] left-[120px] w-[640px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Hecho por la comunidad
        </Rise>
        <Rise className="mt-4 text-[120px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase" delay={0.2}>
          El equipo
        </Rise>
        <Rise className="mt-6 text-[36px] font-medium text-[#FBF5E7]/70" delay={0.4}>
          {DATE_LABEL}
        </Rise>
      </div>
      <div className="absolute top-0 right-[120px] bottom-0 w-[820px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee-y flex flex-col gap-[56px] py-[60px]" style={{ animationDuration: "48s" }}>
          {TEAM_LOOP.map((member, i) => (
            <div
              key={`${member.lastname}-${i}`}
              aria-hidden={i >= TEAM_2026.length}
              className="flex items-center gap-10"
            >
              <div
                className="flex h-[200px] w-[200px] shrink-0 items-end justify-center overflow-hidden rounded-full"
                style={{ background: i % 2 ? BRAND.blue : BRAND.yellow }}
              >
                <img alt="" className="h-[190px] w-[190px] object-cover object-top" src={member.picture} />
              </div>
              <div>
                <p className="text-[52px] leading-none font-extrabold tracking-[-0.01em]">
                  {member.firstname} {member.lastname}
                </p>
                <p className="mt-3 text-[28px] text-[#FBF5E7]/65">{member.jobTitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
