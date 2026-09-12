"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { SPONSORS_2026 } from "app/conf/components/Sponsors";
import { TANGRAM_PIECES } from "app/conf/components/TangramGallery";
import { CONF_DATES } from "app/lib/constants";
import { motivationalPhrases } from "components/displays/StickyNoteDisplay";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type StickyNote } from "lib/orpc";
import type { SceneProps } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Confetti } from "../effects";
import { Ambient, BRAND, Caption, Flag, H, StageContext, W, useStageFrame } from "../Stage";
import { HAPPY_MS, drawFace, initialSim } from "./OwyFace";
import { LogoReveal, MOMENT_PHOTOS, Rise } from "./parts";

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------
// Launch — 10 … 1, then the logo bursts in
// ---------------------------------------------------------------------------

export function Launch({ params }: SceneProps<"launch">) {
  const { preview } = useContext(StageContext);
  const [n, setN] = useState(params.seconds);
  const done = n <= 0;

  useEffect(() => {
    setN(params.seconds);
    if (preview) return;
    const id = setInterval(() => setN((value) => (value <= 0 ? 0 : value - 1)), 1000);
    return () => clearInterval(id);
  }, [params.seconds, preview]);

  return (
    <>
      <Ambient />
      <AnimatePresence mode="popLayout">
        {!done ? (
          <m.div
            key={n}
            animate={{ scale: 1, opacity: 1 }}
            className="countdown-font absolute inset-0 flex items-center justify-center text-[760px] leading-none text-[#F5BB03]"
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
            initial={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            {n}
          </m.div>
        ) : (
          <m.div key="go" animate={{ opacity: 1 }} className="absolute inset-0" initial={{ opacity: 0 }}>
            <m.div
              animate={{ opacity: 0 }}
              className="absolute inset-0 bg-[#FBF5E7]"
              initial={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            <div className="absolute top-[330px] left-[360px]">
              <LogoReveal delay={0.1} />
            </div>
            <Rise
              className="absolute inset-x-0 top-[720px] text-center text-[96px] font-extrabold tracking-[-0.02em] text-[#F5BB03] uppercase"
              delay={0.7}
            >
              ¡Empezamos!
            </Rise>
            {!preview && (
              <>
                <Confetti />
                <Confetti />
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
      {!done && (
        <svg className="absolute inset-0" viewBox="0 0 1920 1080">
          <m.circle
            key={n}
            animate={{ pathLength: 0, opacity: 0.2 }}
            cx="960"
            cy="540"
            fill="none"
            initial={{ pathLength: 1, opacity: 0.9 }}
            r="440"
            stroke={BRAND.blue}
            strokeLinecap="round"
            strokeWidth="14"
            transform="rotate(-90 960 540)"
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Terminal — the boot sequence, typed
// ---------------------------------------------------------------------------

type TermLine = { text: string; kind: "cmd" | "ok" | "info" | "big" };

export function Terminal({ eventId }: SceneProps<"terminal">) {
  const { preview } = useContext(StageContext);
  const [tracks, setTracks] = useState<number | null>(null);
  useEffect(() => {
    if (!eventId) return;
    client.tracks
      .list({ openSpaceId: eventId })
      .then((list) => setTracks(list.length))
      .catch(() => setTracks(null));
  }, [eventId]);

  const lines = useMemo<TermLine[]>(
    () => [
      { text: 'owu conf --edition 2026 --venue "Sinergia Faro"', kind: "cmd" },
      { text: "cargando comunidad", kind: "ok" },
      { text: "speakers y charlas", kind: "ok" },
      { text: tracks === null ? "open space" : `open space · ${tracks} ideas en la grilla`, kind: "ok" },
      { text: `sponsors · ${SPONSORS_2026.length} empresas`, kind: "ok" },
      { text: "owy --voice --mate", kind: "ok" },
      { text: "todo listo. sin bugs (por ahora)", kind: "info" },
      { text: "./start", kind: "cmd" },
      { text: "OWU CONF 2026 — READY", kind: "big" },
    ],
    [tracks]
  );

  // Characters revealed so far across the whole script; resets when the script changes.
  const [shown, setShown] = useState(0);
  const total = lines.reduce((sum, line) => sum + line.text.length + 1, 0);
  useEffect(() => {
    setShown(preview ? total : 0);
    if (preview) return;
    const id = setInterval(() => setShown((value) => (value >= total ? value : value + 1)), 28);
    return () => clearInterval(id);
  }, [total, preview]);

  let budget = shown;
  const visible = lines.map((line) => {
    const count = Math.max(0, Math.min(line.text.length, budget));
    const started = budget > 0;
    budget -= line.text.length + 1;
    return { ...line, shown: line.text.slice(0, count), started, complete: count === line.text.length };
  });
  const finished = shown >= total;

  return (
    <div className="font-terminal absolute inset-0 bg-[#050505] px-[140px] py-[110px] text-[40px] leading-[1.6] text-[#FBF5E7]">
      <div className="mb-10 flex items-center gap-4 text-[24px] text-[#FBF5E7]/40">
        <span className="h-[18px] w-[18px] rounded-full bg-[#F5BB03]" />
        <span className="h-[18px] w-[18px] rounded-full bg-[#0162C8]" />
        <span className="h-[18px] w-[18px] rounded-full bg-[#FBF5E7]/30" />
        <span className="ml-4 tracking-[0.2em]">owu@conf: ~/2026</span>
      </div>
      {visible
        .filter((line) => line.started)
        .map((line, i) => (
          <div key={i} className={line.kind === "big" ? "mt-10" : ""}>
            {line.kind === "cmd" && <span className="text-[#F5BB03]">$ </span>}
            {line.kind === "ok" && <span className="text-[#0162C8]">▸ </span>}
            {line.kind === "big" ? (
              <span className="font-display text-[110px] leading-none font-extrabold tracking-[-0.02em] text-[#F5BB03] uppercase">
                {line.shown}
              </span>
            ) : (
              <span className={line.kind === "info" ? "text-[#FBF5E7]/60" : ""}>{line.shown}</span>
            )}
            {line.kind === "ok" && line.complete && <span className="ml-6 text-[#F5BB03]">ok</span>}
          </div>
        ))}
      <span
        className={`inline-block h-[44px] w-[24px] translate-y-2 bg-[#FBF5E7] ${finished ? "animate-blink" : ""}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ideas — the open-space titles drifting like a galaxy
// ---------------------------------------------------------------------------

type Idea = { note: StickyNote; x: number; y: number; vx: number; vy: number; size: number; phase: number; w: number };

export function Ideas({ eventId }: SceneProps<"ideas">) {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ideas = useRef<Idea[]>([]);
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!eventId) return;
    client.tracks
      .list({ openSpaceId: eventId })
      .then((notes) => {
        ideas.current = notes.map((note, i) => {
          const angle = i * 2.4; // golden-angle spiral keeps them spread without overlap checks
          const radius = 120 + Math.sqrt(i) * 110;
          return {
            note,
            x: Math.min(Math.max(W / 2 + Math.cos(angle) * radius * 1.4, 80), W - 700),
            y: Math.min(Math.max(H / 2 + Math.sin(angle) * radius * 0.85, 80), H - 80),
            vx: rand(-8, 8),
            vy: rand(-6, 6),
            size: rand(26, 40),
            phase: rand(0, Math.PI * 2),
            w: 0,
          };
        });
        setCount(notes.length);
      })
      .catch((error) => console.error("[stage] ideas", error));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "sync") : null, (event) => {
    if (event === "card_change") load();
  });

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "middle";
    const list = ideas.current;
    for (const idea of list) {
      if (!idea.w) {
        ctx.font = `700 ${idea.size}px Poppins, sans-serif`;
        idea.w = ctx.measureText(idea.note.title).width + idea.size * 1.2;
      }
    }
    // Labels nudge each other apart so titles stay readable.
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x + b.w / 2 - (a.x + a.w / 2);
        const dy = b.y - a.y;
        const overlapX = (a.w + b.w) / 2 + 40 - Math.abs(dx);
        const overlapY = 70 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const push = (overlapY / 70) * 60 * s;
          const dir = dy >= 0 ? 1 : -1;
          a.y -= push * dir;
          b.y += push * dir;
        }
      }
    }
    for (const idea of list) {
      idea.x += (idea.vx + Math.sin(t / 1900 + idea.phase) * 12) * s;
      idea.y += (idea.vy + Math.cos(t / 2300 + idea.phase) * 9) * s;
      if (idea.x < 60 || idea.x + idea.w > W - 60) {
        idea.vx *= -1;
        idea.x = Math.min(Math.max(idea.x, 60), W - 60 - idea.w);
      }
      if (idea.y < 60 || idea.y > H - 60) {
        idea.vy *= -1;
        idea.y = Math.min(Math.max(idea.y, 60), H - 60);
      }

      const color = roomColorFor(idea.note.roomId, idea.note.roomColor);
      ctx.font = `700 ${idea.size}px Poppins, sans-serif`;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(idea.x, idea.y, idea.size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BRAND.cream;
      ctx.globalAlpha = 0.55 + (idea.size - 26) / 28;
      ctx.fillText(idea.note.title, idea.x + idea.size * 0.7, idea.y);
      ctx.globalAlpha = 1;
    }
  });

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <div className="pointer-events-none absolute top-[90px] left-[120px]">
        <Rise className="text-[26px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Open Space
        </Rise>
        <Rise className="mt-2 text-[72px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          {count === null ? "Ideas" : `${count} ideas`}
        </Rise>
      </div>
    </>
  );
}

function EmptyText({ text }: { text: string }) {
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
// Tangram — the /conf photo collage, assembling on the wall and shuffling
// ---------------------------------------------------------------------------

const MOMENTS = MOMENT_PHOTOS;
const TANGRAM_SIZE = 940;

export function Tangram() {
  const { preview } = useContext(StageContext);
  const [photos, setPhotos] = useState(() => TANGRAM_PIECES.map((piece) => piece.photo));

  // Every few seconds one piece swaps to another moment.
  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => {
      setPhotos((current) => {
        const next = [...current];
        const slot = Math.floor(Math.random() * next.length);
        next[slot] = MOMENTS[Math.floor(Math.random() * MOMENTS.length)];
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [preview]);

  return (
    <>
      <Ambient />
      <div
        className="absolute"
        style={{
          left: (W - TANGRAM_SIZE) / 2 + 300,
          top: (H - TANGRAM_SIZE) / 2,
          width: TANGRAM_SIZE,
          height: TANGRAM_SIZE,
        }}
      >
        {TANGRAM_PIECES.map((piece, i) => (
          <m.div
            key={piece.clip}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            className="absolute inset-0"
            initial={{ x: piece.from.x * 3, y: piece.from.y * 3, rotate: piece.from.rotate * 2, opacity: 0 }}
            style={{ clipPath: piece.clip }}
            transition={{ duration: 1.1, delay: 0.15 + i * 0.12, ease: EASE_OUT }}
          >
            <AnimatePresence initial={false}>
              <m.img
                key={photos[i]}
                alt=""
                animate={{ opacity: 1 }}
                className="absolute h-full w-full object-cover"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                src={photos[i]}
                style={{ ...piece.box, objectPosition: piece.focus }}
                transition={{ duration: 0.8 }}
              />
            </AnimatePresence>
          </m.div>
        ))}
      </div>
      <div className="absolute top-[300px] left-[120px] w-[520px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Comunidad
        </Rise>
        <Rise className="mt-4 text-[110px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase" delay={0.2}>
          Hecha por vos
        </Rise>
        <Rise className="mt-6 text-[34px] font-medium text-[#FBF5E7]/70" delay={0.4}>
          Momentos de La Meetup III
        </Rise>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Kaleidoscope — brand shapes mirrored 8 ways
// ---------------------------------------------------------------------------

type Petal = { r: number; a: number; size: number; kind: number; color: string; vr: number; va: number; spin: number };
const SEGMENTS = 8;

export function Kaleidoscope() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const petals = useMemo<Petal[]>(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        r: rand(80, 620),
        a: rand(0, Math.PI / SEGMENTS),
        size: rand(40, 150),
        kind: i % 4,
        color: [BRAND.yellow, BRAND.blue, BRAND.cream][i % 3],
        vr: rand(-30, 30),
        va: rand(-0.12, 0.12),
        spin: rand(-0.6, 0.6),
      })),
    []
  );

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const p of petals) {
      p.r += p.vr * s;
      if (p.r < 60 || p.r > 700) p.vr *= -1;
      p.a += p.va * s;
    }
    for (let seg = 0; seg < SEGMENTS; seg++) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((seg * Math.PI * 2) / SEGMENTS + t / 9000);
      if (seg % 2) ctx.scale(1, -1);
      for (const p of petals) {
        ctx.save();
        ctx.rotate(p.a);
        ctx.translate(p.r, 0);
        ctx.rotate((t / 1000) * p.spin);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const h = p.size;
        if (p.kind === 0) {
          ctx.moveTo(-h / 2, -h / 2);
          ctx.lineTo(h / 2, 0);
          ctx.lineTo(-h / 2, h / 2);
        } else if (p.kind === 1) ctx.arc(0, 0, h / 2.4, 0, Math.PI * 2);
        else if (p.kind === 2) ctx.rect(-h / 2.6, -h / 2.6, h / 1.3, h / 1.3);
        else ctx.arc(0, 0, h / 2, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  });

  return <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Owy charlatán — the face, chatting on its own
// ---------------------------------------------------------------------------

export function OwyTalks() {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef(initialSim());
  const [line, setLine] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (preview) return;
    let timer: ReturnType<typeof setTimeout>;
    const say = () => {
      const text = motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];
      const s = sim.current;
      s.mood = "thinking";
      timer = setTimeout(() => {
        s.mood = "speaking";
        setLine({ id: Date.now(), text });
        const speaking = 1200 + text.length * 55;
        timer = setTimeout(() => {
          s.mood = "idle";
          s.happyUntil = s.now + HAPPY_MS;
          timer = setTimeout(() => {
            setLine(null);
            timer = setTimeout(say, rand(3000, 7000));
          }, 2500);
        }, speaking);
      }, 900);
    };
    timer = setTimeout(say, 2500);
    return () => clearTimeout(timer);
  }, [preview]);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFace(ctx, sim.current, t, dt);
  });

  return (
    <>
      <Ambient />
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <AnimatePresence>{line && <Caption key={line.id} text={line.text} />}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ticker — a news bar for the bottom of the frame (overlay-friendly)
// ---------------------------------------------------------------------------

export function Ticker({ params }: SceneProps<"ticker">) {
  const items = params.text
    .split("·")
    .map((item) => item.trim())
    .filter(Boolean);
  const loop = [...items, ...items, ...items];
  const seconds = Math.max(18, loop.join("").length * 0.22);

  return (
    <m.div
      animate={{ y: 0 }}
      className="absolute inset-x-0 bottom-0 flex h-[96px] items-stretch bg-black"
      initial={{ y: 96 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <div className="flex shrink-0 items-center gap-4 bg-[#F5BB03] px-10 text-[30px] font-extrabold tracking-[0.12em] text-black uppercase">
        <Flag className="h-[34px] w-[34px]" fill="#000" />
        {params.label}
      </div>
      <div className="flex flex-1 items-center overflow-hidden">
        <div className="animate-marquee flex w-max items-center" style={{ animationDuration: `${seconds}s` }}>
          {[0, 1].map((half) => (
            <div key={half} aria-hidden={half === 1} className="flex items-center">
              {loop.map((item, i) => (
                <span key={i} className="flex items-center px-10 text-[34px] font-medium whitespace-nowrap">
                  {item}
                  <span className="ml-20 h-[12px] w-[12px] rounded-full bg-[#0162C8]" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </m.div>
  );
}

// ---------------------------------------------------------------------------
// Talk timer — a speaker clock that starts when the scene goes up
// ---------------------------------------------------------------------------

export function Talk({ params }: SceneProps<"talk">) {
  const total = params.minutes * 60;
  const startedAt = useMemo(() => Date.now(), []);
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, total - Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [total, startedAt]);

  const progress = total ? left / total : 0;
  const warn = left <= 120 && left > 0;
  const over = left === 0;
  const color = over ? "#EF4444" : warn ? BRAND.yellow : BRAND.blue;

  return (
    <>
      <Ambient />
      <div className="absolute top-[200px] left-[120px] w-[1000px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Ahora
        </Rise>
        <Rise
          className={`mt-6 leading-[0.98] font-extrabold tracking-[-0.02em] text-balance uppercase ${params.title.length > 40 ? "text-[84px]" : "text-[110px]"}`}
          delay={0.2}
        >
          {params.title}
        </Rise>
        {params.speaker && (
          <Rise className="mt-8 text-[56px] font-medium text-[#FBF5E7]/85" delay={0.45}>
            {params.speaker}
          </Rise>
        )}
      </div>
      <div className="absolute top-[190px] right-[140px] h-[700px] w-[700px]">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 700 700">
          <circle cx="350" cy="350" fill="none" r="320" stroke="rgba(251,245,231,0.12)" strokeWidth="22" />
          <m.circle
            animate={{ pathLength: progress }}
            cx="350"
            cy="350"
            fill="none"
            initial={{ pathLength: 1 }}
            r="320"
            stroke={color}
            strokeLinecap="round"
            strokeWidth="22"
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </svg>
        <div
          className={`countdown-font absolute inset-0 flex items-center justify-center text-[190px] leading-none tracking-wider ${over ? "animate-timer-pulse text-red-500" : warn ? "text-[#F5BB03]" : "text-[#FBF5E7]"}`}
        >
          {over ? "FIN" : formatTime(left)}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sponsor spotlight — one at a time
// ---------------------------------------------------------------------------

export function Sponsor({ params }: SceneProps<"sponsor">) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SPONSORS_2026.length), params.secondsPerSponsor * 1000);
    return () => clearInterval(id);
  }, [params.secondsPerSponsor]);
  const sponsor = SPONSORS_2026[index];

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[170px] text-center">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Gracias a
        </Rise>
      </div>
      <AnimatePresence mode="wait">
        <m.div
          key={sponsor.name}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          className="absolute inset-x-[360px] top-[300px] flex h-[460px] items-center justify-center"
          exit={{ opacity: 0, clipPath: "inset(0 0 0 100%)", transition: { duration: 0.45, ease: "easeIn" } }}
          initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        >
          <img
            alt={sponsor.name}
            className="max-h-[360px] max-w-[1000px] object-contain brightness-0 invert"
            src={sponsor.logo}
          />
        </m.div>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <m.p
          key={sponsor.name}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-0 top-[820px] text-center text-[54px] font-extrabold tracking-[-0.01em] uppercase"
          exit={{ opacity: 0, y: -12, transition: { duration: 0.3 } }}
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT }}
        >
          {sponsor.name}
        </m.p>
      </AnimatePresence>
      <div className="absolute inset-x-[360px] top-[910px] flex justify-center gap-4">
        {SPONSORS_2026.map((item, i) => (
          <span
            key={item.name}
            className={`h-[10px] w-[42px] transition-colors duration-500 ${i === index ? "bg-[#F5BB03]" : "bg-[#FBF5E7]/20"}`}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Days — how far the conference is
// ---------------------------------------------------------------------------

export function Days() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(CONF_DATES.event).getTime() - now;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000);
  const today = ms <= 0 || days === 0;

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[200px] text-center">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {ms <= 0 ? "OWU CONF 2026" : "Faltan"}
        </Rise>
        <div className="countdown-font mt-4 text-[440px] leading-none tracking-wider text-[#F5BB03] select-none">
          {ms <= 0 ? "HOY" : today ? hours : days}
        </div>
        <Rise className="text-[64px] font-extrabold tracking-[-0.01em] uppercase" delay={0.3}>
          {ms <= 0 ? "¡Es hoy!" : today ? (hours === 1 ? "hora" : "horas") : days === 1 ? "día" : "días"}
        </Rise>
        <Rise className="mt-8 text-[36px] font-medium tracking-[0.12em] text-[#FBF5E7]/70 uppercase" delay={0.5}>
          Sábado 07 de noviembre · Sinergia Faro
        </Rise>
      </div>
    </>
  );
}
