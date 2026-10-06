"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { client } from "lib/orpc";
import type { StageWeather } from "lib/orpc/owy-stage/services";
import type { SceneProps } from "lib/owy-stage/scenes";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Ambient, BRAND, StageContext, useStageFrame } from "../Stage";
import { QrCode, Rise } from "./parts";
import { Header, parseItem, splitList } from "./service";
import { EmptyText, parseProgram, secondsUntil, useBoard, useNow } from "./useful";

// ---------------------------------------------------------------------------
// Grid — the open space grid, rooms × slots, live from the board
// ---------------------------------------------------------------------------

export function Grid({ eventId }: SceneProps<"grid">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const now = useNow(15_000);

  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const rooms = data.rooms.filter((room) => room.isActive).slice(0, 6);
  const slots = data.schedules
    .filter((slot) => slot.isActive)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 6);
  if (!rooms.length || !slots.length) return <EmptyText text="Todavía no hay grilla" />;

  return (
    <>
      <div className="absolute inset-x-[80px] top-[50px] flex items-end justify-between">
        <Rise className="text-[56px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.05}>
          Grilla del open space
        </Rise>
        <p className="pb-1 text-[28px] font-semibold tracking-[0.2em] text-[#F5BB03] uppercase">
          {data.tracks.length} sesiones · {now}
        </p>
      </div>
      <div
        className="absolute inset-x-[80px] top-[140px] bottom-[50px] grid gap-[6px]"
        style={{
          gridTemplateColumns: `150px repeat(${rooms.length}, 1fr)`,
          gridTemplateRows: `70px repeat(${slots.length}, 1fr)`,
        }}
      >
        <div />
        {rooms.map((room) => (
          <div key={room.id} className="flex items-center justify-center bg-[#FBF5E7]/[0.08] px-3">
            <span
              className="h-[18px] w-[18px] shrink-0 rounded-full"
              style={{ background: roomColorFor(room.id, room.color) }}
            />
            <span className="ml-3 truncate text-[28px] font-extrabold uppercase">{room.name}</span>
          </div>
        ))}
        {slots.map((slot) => {
          const live = slot.startTime <= now && now < slot.endTime;
          return [
            <div
              key={slot.id}
              className={`flex flex-col items-center justify-center ${live ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.08]"}`}
            >
              <span className="text-[30px] leading-none font-extrabold tabular-nums">{slot.startTime}</span>
              <span className={`mt-1 text-[20px] tabular-nums ${live ? "text-black/70" : "text-[#FBF5E7]/50"}`}>
                {slot.endTime}
              </span>
            </div>,
            ...rooms.map((room) => {
              const note = data.tracks.find((track) => track.roomId === room.id && track.scheduleId === slot.id);
              return (
                <m.div
                  key={`${slot.id}-${room.id}`}
                  animate={{ opacity: 1 }}
                  className={`flex flex-col justify-center overflow-hidden px-4 py-2 ${
                    note ? "text-black" : live ? "bg-[#F5BB03]/15" : "bg-[#FBF5E7]/[0.04]"
                  }`}
                  initial={{ opacity: 0 }}
                  style={note ? { background: roomColorFor(room.id, room.color) } : undefined}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  {note ? (
                    <>
                      <p className="line-clamp-2 text-[26px] leading-[1.1] font-bold">{note.title}</p>
                      {note.speaker && <p className="mt-1 truncate text-[20px] text-black/70">{note.speaker}</p>}
                    </>
                  ) : (
                    <p className="text-[22px] text-[#FBF5E7]/25">—</p>
                  )}
                </m.div>
              );
            }),
          ];
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Check-in — the reception flow
// ---------------------------------------------------------------------------

export function Checkin({ params }: SceneProps<"checkin">) {
  const steps = [params.step1, params.step2, params.step3].map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <Ambient />
      <Header eyebrow={params.eyebrow} title="Acreditación" />
      <ol className="absolute top-[330px] left-[340px] flex w-[880px] flex-col gap-[28px]">
        {steps.map((step, i) => (
          <m.li
            key={`${i}-${step}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.15, ease: EASE_OUT }}
          >
            <span
              className="flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-full text-[52px] font-extrabold"
              style={{ background: i % 2 ? BRAND.blue : BRAND.yellow, color: i % 2 ? BRAND.cream : "#000" }}
            >
              {i + 1}
            </span>
            <span className="text-[44px] leading-[1.15] font-semibold text-balance">{step}</span>
          </m.li>
        ))}
      </ol>
      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-[340px] right-[140px] w-[480px] border-l-[12px] border-[#F5BB03] bg-[#FBF5E7]/[0.07] px-8 py-7"
        initial={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.6, delay: 0.8, ease: EASE_OUT }}
      >
        <p className="text-[26px] font-bold tracking-[0.25em] text-[#F5BB03] uppercase">Fotos</p>
        <p className="mt-3 text-[32px] leading-[1.25] font-semibold text-balance">{params.photoNote}</p>
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Badges — what the lanyards and stickers mean
// ---------------------------------------------------------------------------

export function Badges({ params }: SceneProps<"badges">) {
  const items = splitList(params.lines).map(parseItem).slice(0, 6);
  return (
    <>
      <Ambient />
      <Header eyebrow="Leé a la gente" title="Colores y stickers" />
      <ul className="absolute top-[330px] right-[140px] left-[340px] grid grid-cols-2 gap-x-[40px] gap-y-[20px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item.name}`}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-7 bg-[#FBF5E7]/[0.06] px-7 py-5"
            initial={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
          >
            <span className="w-[90px] text-center text-[64px] leading-none">{item.icon || "●"}</span>
            <span>
              <span className="block text-[36px] leading-[1.1] font-extrabold uppercase">{item.name}</span>
              <span className="mt-1 block text-[28px] leading-[1.2] text-[#FBF5E7]/70">{item.detail}</span>
            </span>
          </m.li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stands — where the sponsors are
// ---------------------------------------------------------------------------

export function Stands({ params }: SceneProps<"stands">) {
  const items = splitList(params.lines).map(parseItem).slice(0, 8);
  return (
    <>
      <Ambient />
      <Header eyebrow={params.eyebrow} title="Stands" />
      <ul className="absolute top-[330px] right-[140px] left-[340px] grid grid-cols-2 gap-x-[30px] gap-y-[18px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item.name}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-7 border-b-[3px] border-[#FBF5E7]/15 py-4"
            initial={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
          >
            <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center bg-[#F5BB03] text-[40px] font-extrabold text-black">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[38px] leading-[1.1] font-extrabold">{item.name}</span>
              <span className="mt-1 block truncate text-[26px] text-[#FBF5E7]/65">{item.detail}</span>
            </span>
          </m.li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lost & found
// ---------------------------------------------------------------------------

export function LostFound({ params }: SceneProps<"lost-found">) {
  const items = splitList(params.items).slice(0, 12);
  return (
    <>
      <Ambient />
      <Header eyebrow="¿Es tuyo?" title="Objetos perdidos" />
      <ul className="absolute top-[330px] left-[340px] flex w-[980px] flex-wrap content-start gap-[16px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item}`}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#FBF5E7]/[0.08] px-8 py-4 text-[36px] font-semibold"
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.07, ease: EASE_OUT }}
          >
            {item}
          </m.li>
        ))}
        {!items.length && <li className="text-[40px] text-[#FBF5E7]/50">Por ahora, nada. Bien ahí.</li>}
      </ul>
      <div className="absolute top-[340px] right-[140px] w-[400px] bg-[#0162C8] px-8 py-8 text-[#FBF5E7]">
        <p className="text-[24px] font-bold tracking-[0.25em] uppercase opacity-80">Retiralos en</p>
        <p className="mt-2 text-[44px] leading-[1.1] font-extrabold text-balance">{params.where}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Live — we are streaming
// ---------------------------------------------------------------------------

export function Live({ params }: SceneProps<"live">) {
  return (
    <>
      <Ambient />
      <div className="absolute top-[100px] left-[140px] flex items-center gap-8">
        <m.span
          animate={{ opacity: [1, 0.2, 1] }}
          className="h-[44px] w-[44px] rounded-full bg-[#EF4444]"
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <Rise className="text-[36px] font-extrabold tracking-[0.3em] uppercase" delay={0.05}>
          En vivo
        </Rise>
      </div>
      <div className="absolute top-[200px] left-[140px] w-[1000px]">
        <Rise className="text-[96px] leading-[1] font-extrabold tracking-[-0.02em] text-balance uppercase" delay={0.15}>
          {params.title}
        </Rise>
        <p className="mt-10 text-[42px] leading-[1.25] font-semibold text-balance text-[#FBF5E7]/80">
          {params.subtitle}
        </p>
        <p className="mt-8 inline-block bg-[#F5BB03] px-6 py-3 font-terminal text-[36px] text-black">
          {params.url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <div className="absolute top-[300px] right-[140px]">
        <QrCode size={440} value={params.url} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Weather — outside, right now (Open-Meteo through the site)
// ---------------------------------------------------------------------------

function describe(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Despejado" };
  if (code <= 2) return { icon: "🌤️", label: "Algo nublado" };
  if (code === 3) return { icon: "☁️", label: "Nublado" };
  if (code <= 48) return { icon: "🌫️", label: "Niebla" };
  if (code <= 57) return { icon: "🌦️", label: "Llovizna" };
  if (code <= 67) return { icon: "🌧️", label: "Lluvia" };
  if (code <= 77) return { icon: "🌨️", label: "Nieve (¡en Montevideo!)" };
  if (code <= 82) return { icon: "🌧️", label: "Chaparrones" };
  return { icon: "⛈️", label: "Tormenta" };
}

export function Weather() {
  const [weather, setWeather] = useState<StageWeather | null | undefined>(undefined);

  useEffect(() => {
    const load = () =>
      client.owyStage
        .getWeather()
        .then(setWeather)
        .catch(() => setWeather(null));
    load();
    const id = setInterval(load, 15 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (weather === undefined) return <Ambient />;
  if (weather === null) return <EmptyText text="Sin datos del tiempo" />;
  const now = describe(weather.code);
  const rainSoon = weather.hours.slice(0, 3).some((h) => h.rain >= 40);
  const tip = rainSoon
    ? "Viene lluvia: paraguas al salir."
    : weather.temp < 14
      ? "Está fresco afuera: abrigate."
      : "Noche linda para la vuelta.";

  return (
    <>
      <Ambient />
      <Header eyebrow="Montevideo · ahora" title="Afuera" />
      <div className="absolute top-[300px] left-[340px] flex items-center gap-10">
        <span className="text-[200px] leading-none">{now.icon}</span>
        <div>
          <p className="text-[200px] leading-none font-extrabold tracking-[-0.04em] tabular-nums">
            {Math.round(weather.temp)}
            <span className="text-[100px] text-[#F5BB03]">°</span>
          </p>
          <p className="mt-2 text-[40px] font-semibold text-[#FBF5E7]/80">
            {now.label} · sensación {Math.round(weather.feels)}° · viento {Math.round(weather.wind)} km/h
          </p>
        </div>
      </div>
      <div className="absolute top-[640px] right-[140px] left-[340px] flex gap-[16px]">
        {weather.hours.map((hour, i) => (
          <m.div
            key={hour.time}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col items-center bg-[#FBF5E7]/[0.07] py-5"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.08, ease: EASE_OUT }}
          >
            <span className="text-[26px] font-bold text-[#FBF5E7]/60 tabular-nums">{hour.time}</span>
            <span className="mt-2 text-[56px] leading-none">{describe(hour.code).icon}</span>
            <span className="mt-2 text-[36px] font-extrabold tabular-nums">{Math.round(hour.temp)}°</span>
            <span
              className={`mt-1 text-[24px] font-semibold ${hour.rain >= 40 ? "text-[#0162C8]" : "text-[#FBF5E7]/50"}`}
            >
              💧 {hour.rain}%
            </span>
          </m.div>
        ))}
      </div>
      <p className="absolute bottom-[80px] left-[340px] text-[36px] font-bold text-[#F5BB03]">{tip}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline — how far into the day we are
// ---------------------------------------------------------------------------

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export function Timeline({ params }: SceneProps<"timeline">) {
  const now = useNow(1000);
  const program = useMemo(() => parseProgram(params.items), [params.items]);
  if (!program.length) return <EmptyText text="Sin programa" />;
  const start = toMinutes(program[0].time);
  const explicitEnd = /^\d{1,2}:\d{2}$/.test(params.end)
    ? toMinutes(params.end)
    : toMinutes(program[program.length - 1].time) + 30;
  const end = Math.max(start + 60, explicitEnd);
  const nowMin = toMinutes(now) + new Date().getSeconds() / 60;
  const pct = Math.min(1, Math.max(0, (nowMin - start) / (end - start)));
  const left = Math.max(0, end - nowMin);
  const blocks = program.map((item, i) => {
    const from = toMinutes(item.time);
    const to = i + 1 < program.length ? toMinutes(program[i + 1].time) : end;
    return { ...item, from, to, current: from <= nowMin && nowMin < to };
  });

  return (
    <>
      <Ambient />
      <Header
        eyebrow={`${program[0].time} → ${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`}
        title={params.title}
      />
      <div className="absolute top-[400px] right-[140px] left-[140px]">
        <div className="relative h-[120px]">
          {blocks.map((block, i) => (
            <div
              key={block.time}
              className={`absolute inset-y-0 overflow-hidden ${block.current ? "bg-[#F5BB03]" : i % 2 ? "bg-[#0162C8]/60" : "bg-[#FBF5E7]/15"}`}
              style={{
                left: `${((block.from - start) / (end - start)) * 100}%`,
                width: `calc(${((block.to - block.from) / (end - start)) * 100}% - 4px)`,
              }}
            >
              <p
                className={`px-4 pt-3 text-[22px] leading-[1.1] font-bold ${block.current ? "text-black" : "text-[#FBF5E7]"}`}
              >
                {block.time}
              </p>
              {/* Narrow blocks keep just the time; the title would only get clipped. */}
              {(block.to - block.from) / (end - start) >= 0.07 && (
                <p
                  className={`line-clamp-2 px-4 text-[22px] leading-[1.1] ${block.current ? "text-black/80" : "text-[#FBF5E7]/70"}`}
                >
                  {block.title}
                </p>
              )}
            </div>
          ))}
          <m.div
            animate={{ left: `${pct * 100}%` }}
            className="absolute -top-[70px] -bottom-[30px] w-[6px] -translate-x-1/2 bg-[#FBF5E7]"
            initial={false}
            transition={{ duration: 1, ease: "linear" }}
          >
            <span className="absolute -top-[10px] left-1/2 -translate-x-1/2 -translate-y-full bg-[#FBF5E7] px-4 py-1 text-[28px] font-extrabold whitespace-nowrap text-black tabular-nums">
              {now}
            </span>
          </m.div>
        </div>
        <div className="mt-[70px] flex items-end justify-between">
          <p className="text-[64px] leading-none font-extrabold">
            <span className="text-[#F5BB03]">{Math.round(pct * 100)}%</span> del día
          </p>
          <p className="text-[40px] font-semibold text-[#FBF5E7]/70">
            {left > 0 ? `faltan ${formatTime(Math.round(left * 60))}` : "terminó · gracias"}
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reminders — timed messages that pop on their own
// ---------------------------------------------------------------------------

export function Reminders({ params }: SceneProps<"reminders">) {
  const now = useNow(1000);
  const reminders = useMemo(() => parseProgram(params.lines), [params.lines]);
  const nowMin = toMinutes(now);
  const active = [...reminders]
    .reverse()
    .find((r) => toMinutes(r.time) <= nowMin && nowMin < toMinutes(r.time) + params.hold);
  const next = reminders.find((r) => toMinutes(r.time) > nowMin);

  return (
    <>
      <Ambient />
      <AnimatePresence mode="wait">
        {active ? (
          <m.div
            key={active.time}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-[260px] right-[140px] left-[340px]"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <div className="flex items-center gap-8">
              <m.span
                animate={{ rotate: [0, -18, 18, -12, 12, 0] }}
                className="text-[110px] leading-none"
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
              >
                🔔
              </m.span>
              <span className="text-[36px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">
                Aviso · {active.time}
              </span>
            </div>
            <p className="mt-8 text-[110px] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance">
              {active.title}
            </p>
          </m.div>
        ) : (
          <m.div
            key="idle"
            animate={{ opacity: 1 }}
            className="absolute inset-x-0 top-[240px] text-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <p className="countdown-font text-[380px] leading-none tracking-wider text-[#FBF5E7]">{now}</p>
            <p className="mt-6 text-[44px] font-semibold text-[#FBF5E7]/60">
              {next ? `Próximo aviso a las ${next.time}: ${next.title}` : "Sin avisos pendientes"}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lightning — lightning talks queue with a timer per talk
// ---------------------------------------------------------------------------

export function Lightning({ params }: SceneProps<"lightning">) {
  const { preview } = useContext(StageContext);
  const talks = useMemo(() => splitList(params.talks), [params.talks]);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useStageFrame((t) => {
    if (preview) return;
    if (!startedAt.current) startedAt.current = t;
    const seconds = Math.floor((t - startedAt.current) / 1000);
    setElapsed((v) => (v === seconds ? v : seconds));
  });

  const perTalk = params.minutes * 60;
  const index = Math.min(talks.length, Math.floor(elapsed / perTalk));
  const left = perTalk - (elapsed % perTalk);
  const done = index >= talks.length;
  const warn = left <= 60;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.minutes} min cada una · ${talks.length} charlas`} title={params.title} />
      <div className="absolute top-[320px] left-[340px] w-[860px]">
        {done ? (
          <p className="text-[96px] leading-[1] font-extrabold uppercase">¡Gracias a todos!</p>
        ) : (
          <>
            <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">
              Ahora · {index + 1} de {talks.length}
            </p>
            <AnimatePresence mode="wait">
              <m.p
                key={index}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-[64px] leading-[1.1] font-extrabold text-balance"
                exit={{ opacity: 0, y: -20 }}
                initial={{ opacity: 0, y: 20 }}
              >
                {talks[index]}
              </m.p>
            </AnimatePresence>
            <p
              className={`countdown-font mt-6 text-[260px] leading-none tracking-wider ${warn ? "animate-timer-pulse text-[#F5BB03]" : "text-[#FBF5E7]"}`}
            >
              {formatTime(left)}
            </p>
          </>
        )}
      </div>
      <ol className="absolute top-[340px] right-[140px] flex w-[480px] flex-col gap-[12px]">
        {talks.map((talk, i) => (
          <li
            key={`${i}-${talk}`}
            className={`truncate px-6 py-3 text-[28px] font-semibold ${
              i === index
                ? "bg-[#F5BB03] text-black"
                : i < index
                  ? "text-[#FBF5E7]/35 line-through"
                  : "bg-[#FBF5E7]/[0.06]"
            }`}
          >
            {i + 1}. {talk}
          </li>
        ))}
      </ol>
    </>
  );
}
