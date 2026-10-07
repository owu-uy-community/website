"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { SPONSORS_2026 } from "app/conf/components/Sponsors";
import type { SceneProps } from "lib/owy-stage/scenes";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Confetti, EmojiRain } from "../effects";
import { Ambient, BRAND, Flag, H, StageContext, W, useStageFrame } from "../Stage";
import { LogoReveal, Rise } from "./parts";
import { EmptyText, secondsUntil, useBoard, useNow } from "./useful";

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------
// Board — the marketplace wall of sticky notes, live
// ---------------------------------------------------------------------------

export function Board({ eventId }: SceneProps<"board">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const tilts = useMemo(() => Array.from({ length: 40 }, () => rand(-4, 4)), []);

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const notes = [...data.tracks]
    .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot) || a.room.localeCompare(b.room))
    .slice(0, 24);
  if (notes.length === 0) return <EmptyText text="Todavía no hay ideas en el muro" />;

  return (
    <>
      <div className="absolute inset-x-[80px] top-[60px] flex items-end justify-between">
        <Rise className="text-[64px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.05}>
          Mercado de ideas
        </Rise>
        <p className="pb-2 text-[30px] font-semibold tracking-[0.2em] text-[#F5BB03] uppercase">
          {data.tracks.length} propuestas
        </p>
      </div>
      <div className="absolute inset-x-[60px] top-[170px] flex flex-wrap content-start justify-center gap-[22px]">
        {notes.map((note, i) => (
          <m.div
            key={note.id}
            animate={{ opacity: 1, y: 0, rotate: tilts[i % tilts.length] }}
            className="flex h-[200px] w-[280px] flex-col justify-between p-5 text-black shadow-[0_18px_30px_rgba(0,0,0,0.45)]"
            initial={{ opacity: 0, y: 40, rotate: 0 }}
            style={{ background: roomColorFor(note.roomId, note.roomColor) }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: EASE_OUT }}
          >
            <div>
              <p className="line-clamp-2 text-[27px] leading-[1.15] font-bold">{note.title}</p>
              {note.speaker && <p className="mt-1 truncate text-[20px] font-medium text-black/75">{note.speaker}</p>}
            </div>
            <p className="truncate text-[18px] font-semibold tracking-[0.06em] text-black/65 uppercase">
              {note.timeSlot.split(" - ")[0]} · {note.room}
            </p>
          </m.div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rooms now — one card per room: what's on, what's next
// ---------------------------------------------------------------------------

export function RoomsNow({ eventId }: SceneProps<"rooms-now">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const rooms = data.rooms.filter((room) => room.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const slots = data.schedules.filter((slot) => slot.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const currentIndex = slots.findIndex((slot) => slot.startTime <= now && now < slot.endTime);
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : slots.findIndex((slot) => slot.startTime > now);
  const current = slots[currentIndex];
  const next = slots[nextIndex];
  // Once the day is over, keep the last block on the cards instead of empty columns.
  const last = !current && !next ? slots[slots.length - 1] : undefined;
  if (rooms.length === 0) return <EmptyText text="La grilla todavía no está armada" />;

  return (
    <>
      <div className="absolute inset-x-[80px] top-[70px] flex items-end justify-between">
        <Rise className="text-[64px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.05}>
          {current ? "Ahora en cada sala" : next ? "Próximo bloque" : "Así cerró el open space"}
        </Rise>
        <p className="pb-2 font-terminal text-[36px] text-[#FBF5E7]/60 tabular-nums">{now}</p>
      </div>
      <div
        className="absolute inset-x-[80px] top-[200px] grid gap-[20px]"
        style={{ gridTemplateColumns: `repeat(${rooms.length}, minmax(0, 1fr))` }}
      >
        {rooms.map((room, i) => {
          const color = roomColorFor(room.id, room.color);
          const slot = current ?? next ?? last;
          const note = slot ? data.tracks.find((t) => t.roomId === room.id && t.scheduleId === slot.id) : undefined;
          const later =
            current && next ? data.tracks.find((t) => t.roomId === room.id && t.scheduleId === next.id) : undefined;
          return (
            <m.div
              key={room.id}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-[720px] flex-col overflow-hidden bg-[#FBF5E7]/[0.05]"
              initial={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: 0.15 + i * 0.1, ease: EASE_OUT }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4 text-[28px] font-extrabold tracking-[0.08em] text-black uppercase"
                style={{ background: color }}
              >
                {room.name}
              </div>
              <div className="flex flex-1 flex-col p-6">
                {slot && (
                  <p className="text-[22px] font-semibold tracking-[0.2em] text-[#F5BB03] uppercase">
                    {current ? "Ahora" : next ? "Próximo" : "Último"} · {slot.startTime}
                  </p>
                )}
                {note ? (
                  <>
                    <p className="mt-4 text-[40px] leading-[1.1] font-bold text-balance">{note.title}</p>
                    {note.speaker && <p className="mt-4 text-[26px] text-[#FBF5E7]/65">{note.speaker}</p>}
                  </>
                ) : (
                  <p className="mt-4 text-[34px] text-[#FBF5E7]/30">{slot ? "libre" : "—"}</p>
                )}
                {later && next && (
                  <div className="mt-auto border-t border-[#FBF5E7]/15 pt-4">
                    <p className="text-[18px] font-semibold tracking-[0.2em] text-[#FBF5E7]/50 uppercase">
                      Después · {next.startTime}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[24px] leading-tight font-semibold text-[#FBF5E7]/80">
                      {later.title}
                    </p>
                  </div>
                )}
              </div>
            </m.div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Marquee — giant scrolling text
// ---------------------------------------------------------------------------

export function Marquee({ params }: SceneProps<"marquee">) {
  const text = `${params.text.trim()}  ·  `;
  const row = (outline: boolean, reverse: boolean, top: number) => (
    <div className="absolute right-0 left-0 flex overflow-hidden" style={{ top }}>
      <div
        className="animate-marquee flex w-max whitespace-nowrap"
        style={{
          animationDuration: `${Math.max(14, text.length * 0.9)}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {[0, 1].map((half) => (
          <span
            key={half}
            aria-hidden={half === 1}
            className={`text-[260px] leading-none font-extrabold tracking-[-0.03em] uppercase ${outline ? "text-transparent" : "text-[#F5BB03]"}`}
            style={outline ? { WebkitTextStroke: "4px #FBF5E7" } : undefined}
          >
            {text.repeat(3)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {row(false, false, 180)}
      {row(true, true, 560)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Until — countdown to a clock time
// ---------------------------------------------------------------------------

export function Until({ params }: SceneProps<"until">) {
  const [left, setLeft] = useState(() => secondsUntil(params.time));
  useEffect(() => {
    const tick = () => setLeft(secondsUntil(params.time));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [params.time]);
  const done = left <= 0;

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[200px] text-center">
        <Rise className="text-[40px] font-semibold tracking-[0.3em] text-[#FBF5E7]/60 uppercase" delay={0.05}>
          {params.label}
        </Rise>
        <Rise className="mt-2 text-[110px] font-extrabold tracking-[-0.02em] tabular-nums" delay={0.15}>
          {params.time}
        </Rise>
        <div
          className={`countdown-font mt-4 text-[360px] leading-none tracking-wider select-none ${done ? "animate-timer-pulse text-red-500" : "text-[#F5BB03]"}`}
        >
          {done ? "¡YA!" : formatTime(Math.min(left, 5999))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export function Quote({ params }: SceneProps<"quote">) {
  return (
    <>
      <Ambient />
      <div key={params.text} className="absolute inset-x-[220px] top-1/2 -translate-y-1/2">
        <m.span
          animate={{ opacity: 1, y: 0 }}
          className="block font-display text-[260px] leading-[0.6] text-[#F5BB03]"
          initial={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          “
        </m.span>
        <Rise className="mt-6 text-[84px] leading-[1.1] font-bold tracking-[-0.01em] text-balance" delay={0.2}>
          {params.text}
        </Rise>
        {params.author && (
          <Rise className="mt-10 text-[40px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase" delay={0.5}>
            — {params.author}
          </Rise>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sponsor wall — every logo at once
// ---------------------------------------------------------------------------

export function SponsorWall() {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[110px] text-center">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Gracias a
        </Rise>
        <Rise className="mt-3 text-[96px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          Nuestros sponsors
        </Rise>
      </div>
      <div className="absolute inset-x-[140px] top-[360px] grid grid-cols-5 gap-x-[40px] gap-y-[70px]">
        {SPONSORS_2026.map(({ name, logo }, i) => (
          <m.div
            key={name}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="flex h-[130px] items-center justify-center"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.55, delay: 0.3 + i * 0.07, ease: EASE_OUT }}
          >
            <img alt={name} className="max-h-[100px] max-w-[280px] object-contain brightness-0 invert" src={logo} />
          </m.div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Applause
// ---------------------------------------------------------------------------

export function Applause({ params }: SceneProps<"applause">) {
  const { preview } = useContext(StageContext);
  const [bursts, setBursts] = useState<number[]>([]);
  useEffect(() => {
    if (preview) return;
    const fire = () => setBursts((list) => [...list.slice(-1), Date.now()]);
    fire();
    const id = setInterval(fire, 3000);
    return () => clearInterval(id);
  }, [preview]);

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[120px] top-[230px] text-center">
        <Rise className="text-[48px] font-semibold tracking-[0.3em] text-[#FBF5E7]/70 uppercase" delay={0.05}>
          Un aplauso para
        </Rise>
        <Rise
          className="mt-8 text-[170px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance text-[#F5BB03] uppercase"
          delay={0.2}
        >
          {params.name}
        </Rise>
      </div>
      {!preview && <EmojiRain chars="👏" count={40} />}
      <div className="pointer-events-none absolute inset-0">
        {bursts.map((id) => (
          <Confetti key={id} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Speaker — the intro card before a talk
// ---------------------------------------------------------------------------

export function Speaker({ params }: SceneProps<"speaker">) {
  return (
    <>
      <Ambient />
      <div key={params.name} className="absolute top-[220px] left-[140px] w-[1400px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Ahora en el escenario
        </Rise>
        <Rise
          className={`mt-6 leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase ${params.name.length > 18 ? "text-[130px]" : "text-[170px]"}`}
          delay={0.2}
        >
          {params.name}
        </Rise>
        {params.company && (
          <Rise className="mt-6 text-[40px] font-medium tracking-[0.15em] text-[#FBF5E7]/60 uppercase" delay={0.45}>
            {params.company}
          </Rise>
        )}
        {params.talk && (
          <div className="mt-12 flex items-start gap-8">
            <Flag className="mt-2 h-[60px] w-[60px] shrink-0" fill={BRAND.blue} />
            <Rise className="text-[64px] leading-[1.1] font-bold text-balance" delay={0.6}>
              {params.talk}
            </Rise>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Numbers — count-up stats
// ---------------------------------------------------------------------------

function CountUp({ value, delay }: { value: number; delay: number }) {
  const [shown, setShown] = useState(0);
  useStageFrame((t) => {
    const p = Math.min(1, Math.max(0, (t - delay) / 1800));
    const eased = 1 - Math.pow(1 - p, 3);
    setShown(Math.round(value * eased));
  });
  return <>{shown.toLocaleString("es-UY")}</>;
}

export function Numbers({ params }: SceneProps<"numbers">) {
  const items = [
    [params.n1, params.l1],
    [params.n2, params.l2],
    [params.n3, params.l3],
  ].filter(([, label]) => String(label).trim()) as [number, string][];

  return (
    <>
      <Ambient />
      <Rise
        className="absolute inset-x-0 top-[180px] text-center text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase"
        delay={0.05}
      >
        {params.title}
      </Rise>
      <div
        className="absolute inset-x-[200px] top-[360px] grid gap-[40px]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
      >
        {items.map(([value, label], i) => (
          <m.div
            key={label}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.6, delay: 0.2 + i * 0.2, ease: EASE_OUT }}
          >
            <p className="countdown-font text-[300px] leading-none tracking-wider text-[#F5BB03]">
              <CountUp delay={300 + i * 250} value={value} />
            </p>
            <p className="mt-4 text-[44px] font-bold tracking-[0.12em] uppercase">{label}</p>
          </m.div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rain — code rain in brand colours
// ---------------------------------------------------------------------------

const GLYPHS = "01{}<>/=+*#$%&OWU;:";
const COLUMN = 34;

export function Rain() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const columns = useMemo(
    () =>
      Array.from({ length: Math.ceil(W / COLUMN) }, () => ({
        y: rand(-H, 0),
        speed: rand(260, 620),
        chars: Array.from({ length: 40 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]),
        blue: Math.random() < 0.12,
      })),
    []
  );

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // Fade instead of clear: the trail is the previous frames dimming.
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `bold ${COLUMN - 4}px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";
    columns.forEach((column, i) => {
      column.y += column.speed * (dt / 1000);
      if (column.y > H + 200) {
        column.y = rand(-400, -40);
        column.speed = rand(260, 620);
      }
      const x = i * COLUMN;
      const row = Math.floor(column.y / COLUMN);
      const glyph = column.chars[(row + Math.floor(t / 90)) % column.chars.length];
      ctx.fillStyle = column.blue ? BRAND.blue : BRAND.yellow;
      ctx.fillText(glyph, x, row * COLUMN);
      ctx.fillStyle = BRAND.cream;
      ctx.globalAlpha = 0.55;
      ctx.fillText(column.chars[(row + 3) % column.chars.length], x, (row - 1) * COLUMN);
      ctx.globalAlpha = 1;
    });
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <div className="absolute top-[420px] left-[560px] w-[800px] bg-black/70 p-8">
        <LogoReveal className="!w-[736px]" delay={0.4} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Warp — starfield towards the logo
// ---------------------------------------------------------------------------

type Star = { x: number; y: number; z: number; color: string };

export function Warp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: 700 }, () => ({
        x: rand(-W / 2, W / 2),
        y: rand(-H / 2, H / 2),
        z: rand(0.05, 1),
        color: [BRAND.cream, BRAND.cream, BRAND.yellow, BRAND.blue][Math.floor(Math.random() * 4)],
      })),
    []
  );

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    for (const star of stars) {
      const pz = star.z;
      star.z -= 0.34 * s;
      if (star.z <= 0.02) {
        star.x = rand(-W / 2, W / 2);
        star.y = rand(-H / 2, H / 2);
        star.z = 1;
        continue;
      }
      const sx = W / 2 + star.x / star.z;
      const sy = H / 2 + star.y / star.z;
      const px = W / 2 + star.x / pz;
      const py = H / 2 + star.y / pz;
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
      ctx.strokeStyle = star.color;
      ctx.globalAlpha = Math.min(1, (1 - star.z) * 1.6 + 0.15);
      ctx.lineWidth = (1 - star.z) * 7 + 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <div className="absolute top-[400px] left-[460px]">
        <LogoReveal className="!w-[1000px]" delay={0.8} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Q&A
// ---------------------------------------------------------------------------

export function Questions({ params }: SceneProps<"qa">) {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[120px] top-[230px] text-center">
        <m.div
          animate={{ scale: [1, 1.08, 1] }}
          className="mx-auto flex h-[150px] w-[150px] items-center justify-center rounded-full bg-[#0162C8]"
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg
            className="h-[80px] w-[80px]"
            fill="none"
            stroke={BRAND.cream}
            strokeLinecap="round"
            strokeWidth="8"
            viewBox="0 0 100 100"
          >
            <rect height="46" rx="14" width="28" x="36" y="10" />
            <path d="M22 48a28 28 0 0 0 56 0M50 76v14M34 90h32" />
          </svg>
        </m.div>
        <Rise className="mt-10 text-[190px] leading-none font-extrabold tracking-[-0.03em] uppercase" delay={0.15}>
          ¿Preguntas?
        </Rise>
        <Rise className="mt-8 text-[48px] font-medium text-balance text-[#FBF5E7]/80" delay={0.4}>
          {params.subtitle}
        </Rise>
      </div>
    </>
  );
}
