"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { MAPS_URLS } from "app/lib/constants";
import type { SceneProps } from "lib/owy-stage/scenes";
import { formatTime } from "lib/utils";

import { Ambient, BRAND, StageContext } from "../Stage";
import { QrCode, Rise } from "./parts";
import { parseProgram, secondsUntil, useNow } from "./useful";

const splitList = (value: string) =>
  value
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
/** "🚻 Baños: planta baja" → { icon, name, detail }. The icon is optional. */
function parseItem(line: string) {
  const match = line.match(/^(\p{Extended_Pictographic}\S*)?\s*([^:]+?)(?::\s*(.*))?$/u);
  return { icon: match?.[1] ?? "", name: (match?.[2] ?? line).trim(), detail: (match?.[3] ?? "").trim() };
}

function Header({ eyebrow, title, wide = false }: { eyebrow: string; title: string; wide?: boolean }) {
  return (
    <div className={`absolute top-[100px] left-[140px] ${wide ? "w-[1400px]" : "w-[1100px]"}`}>
      <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
        {eyebrow}
      </Rise>
      <Rise
        className="mt-3 text-[84px] leading-none font-extrabold tracking-[-0.02em] text-balance uppercase"
        delay={0.15}
      >
        {title}
      </Rise>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rounds — open space rounds, with the clock doing the facilitation
// ---------------------------------------------------------------------------

type Round = { start: string; end: string };

function parseRounds(value: string): Round[] {
  return splitList(value)
    .map((item) => item.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ start: match[1].padStart(5, "0"), end: match[2].padStart(5, "0") }));
}

export function Rounds({ params }: SceneProps<"rounds">) {
  const now = useNow(1000);
  const rounds = useMemo(() => parseRounds(params.rounds), [params.rounds]);
  const active = rounds.findIndex((r) => r.start <= now && now < r.end);
  const nextIndex = rounds.findIndex((r) => r.start > now);
  const over = rounds.length > 0 && now >= rounds[rounds.length - 1].end;

  let label = "Empieza en";
  let seconds = 0;
  let caption = "";
  if (active >= 0) {
    label = `Ronda ${active + 1} · termina en`;
    seconds = secondsUntil(rounds[active].end);
    caption = `${rounds[active].start} – ${rounds[active].end}`;
  } else if (over) {
    label = "Open space";
    caption = "Cierre · gracias por las sesiones";
  } else if (nextIndex >= 0) {
    label = nextIndex === 0 ? "Empieza en" : "Cambio de sala · próxima ronda en";
    seconds = secondsUntil(rounds[nextIndex].start);
    caption = `Ronda ${nextIndex + 1} · ${rounds[nextIndex].start}`;
  }

  return (
    <>
      <Ambient />
      <Header
        eyebrow={params.title}
        title={active >= 0 ? `Ronda ${active + 1} de ${rounds.length}` : over ? "Terminó" : "Entre rondas"}
      />
      <div className="absolute top-[330px] left-[340px] w-[820px]">
        <p className="text-[34px] font-semibold tracking-[0.25em] text-[#FBF5E7]/60 uppercase">{label}</p>
        <p className="countdown-font mt-2 text-[300px] leading-none tracking-wider text-[#F5BB03]">
          {over ? "FIN" : formatTime(Math.max(0, Math.min(seconds, 5999)))}
        </p>
        <p className="mt-4 text-[44px] font-bold">{caption}</p>
      </div>
      <ol className="absolute top-[340px] right-[140px] flex w-[520px] flex-col gap-[18px]">
        {rounds.map((round, i) => {
          const state = i === active ? "active" : round.end <= now ? "done" : "pending";
          const startIn = secondsUntil(round.start);
          const endIn = secondsUntil(round.end);
          const progress = state === "active" ? Math.min(1, Math.max(0, -startIn / Math.max(1, endIn - startIn))) : 0;
          return (
            <m.li
              key={round.start}
              animate={{ opacity: 1, x: 0 }}
              className={`relative overflow-hidden px-8 py-5 ${state === "active" ? "bg-[#F5BB03] text-black" : state === "done" ? "bg-[#FBF5E7]/[0.05] text-[#FBF5E7]/40" : "bg-[#FBF5E7]/[0.08]"}`}
              initial={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
            >
              {state === "active" && (
                <div className="absolute inset-y-0 left-0 bg-black/15" style={{ width: `${progress * 100}%` }} />
              )}
              <div className="relative flex items-center justify-between">
                <span className="text-[34px] font-bold">Ronda {i + 1}</span>
                <span className="text-[34px] font-semibold tabular-nums">
                  {round.start} – {round.end}
                </span>
              </div>
            </m.li>
          );
        })}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Now bar — programme-driven lower third for camera feeds (?bg=transparent)
// ---------------------------------------------------------------------------

export function NowBar({ params }: SceneProps<"now-bar">) {
  const { bg } = useContext(StageContext);
  const now = useNow(1000);
  const program = useMemo(() => parseProgram(params.items), [params.items]);
  let current = -1;
  program.forEach((item, i) => {
    if (item.time <= now) current = i;
  });
  const next = program[current + 1];
  const shadow = bg === "transparent" ? "shadow-[0_20px_60px_rgba(0,0,0,0.6)]" : "";

  return (
    <div className={`absolute right-[120px] bottom-[64px] left-[120px] flex items-stretch ${shadow}`}>
      <div className="flex items-center gap-8 bg-[#F5BB03] px-10 py-6 text-black">
        <span className="text-[26px] font-bold tracking-[0.3em] uppercase">Ahora</span>
        <span className="text-[44px] leading-none font-extrabold">
          {current >= 0 ? program[current].title : "Puertas abiertas"}
        </span>
      </div>
      {next && (
        <div className="flex items-center gap-8 bg-[#FBF5E7] px-10 py-6 text-black">
          <span className="text-[26px] font-bold tracking-[0.3em] text-[#0162C8] uppercase">Sigue</span>
          <span className="text-[40px] leading-none font-bold">
            <span className="text-[#0162C8]">{next.time}</span> · {next.title}
          </span>
        </div>
      )}
      <div className="ml-auto flex items-center bg-black px-10 text-[44px] font-extrabold text-[#FBF5E7] tabular-nums">
        {now}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices — rotating announcements
// ---------------------------------------------------------------------------

export function Notices({ params }: SceneProps<"notices">) {
  const { preview } = useContext(StageContext);
  const lines = useMemo(() => splitList(params.lines), [params.lines]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (preview || lines.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), params.seconds * 1000);
    return () => clearInterval(id);
  }, [lines.length, params.seconds, preview]);

  const line = lines[index % Math.max(1, lines.length)] ?? "";
  return (
    <>
      <Ambient />
      <Header eyebrow={`Avisos · ${Math.min(index + 1, lines.length)} / ${lines.length}`} title={params.title} />
      <div className="absolute top-[360px] right-[140px] left-[340px]">
        <AnimatePresence mode="wait">
          <m.p
            key={`${index}-${line}`}
            animate={{ opacity: 1, y: 0 }}
            className="border-l-[14px] border-[#F5BB03] pl-10 text-[76px] leading-[1.15] font-bold text-balance"
            exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
            initial={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            {line}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="absolute bottom-[110px] left-[340px] flex gap-4">
        {lines.map((_, i) => (
          <span key={i} className={`h-[14px] w-[56px] ${i === index ? "bg-[#F5BB03]" : "bg-[#FBF5E7]/25"}`} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Changes — what moved, what got cancelled
// ---------------------------------------------------------------------------

export function Changes({ params }: SceneProps<"changes">) {
  const now = useNow(60_000);
  const changes = splitList(params.lines).map((line) => {
    const [before, after = ""] = line.split(/→|->/).map((v) => v.trim());
    return { before, after, cancelled: /cancel/i.test(after) };
  });

  return (
    <>
      <Ambient />
      <Header eyebrow={`Actualizado ${now}`} title="Cambios en el programa" />
      <ul className="absolute top-[340px] right-[140px] left-[340px] flex flex-col gap-[22px]">
        {changes.slice(0, 5).map((change, i) => (
          <m.li
            key={`${i}-${change.before}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8 bg-[#FBF5E7]/[0.06] px-8 py-6"
            initial={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
          >
            <span className="w-[640px] text-[40px] leading-[1.15] font-semibold text-[#FBF5E7]/70">
              {change.before}
            </span>
            <span className="text-[56px] text-[#F5BB03]">→</span>
            <span
              className={`flex-1 text-[44px] leading-[1.15] font-extrabold ${change.cancelled ? "text-[#F5BB03]" : "text-[#FBF5E7]"}`}
            >
              {change.after || "—"}
            </span>
          </m.li>
        ))}
        {!changes.length && (
          <li className="text-[48px] font-semibold text-[#FBF5E7]/60">Sin cambios. Todo según el programa.</li>
        )}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Facilities — where things are
// ---------------------------------------------------------------------------

export function Facilities({ params }: SceneProps<"facilities">) {
  const items = splitList(params.items).map(parseItem).slice(0, 8);
  return (
    <>
      <Ambient />
      <Header eyebrow="Servicios" title={params.title} />
      <ul className="absolute top-[330px] right-[140px] left-[340px] grid grid-cols-4 gap-[20px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item.name}`}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[250px] flex-col bg-[#FBF5E7]/[0.06] px-7 py-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
          >
            <span className="text-[72px] leading-none">{item.icon || "•"}</span>
            <span className="mt-5 text-[34px] leading-[1.1] font-extrabold uppercase">{item.name}</span>
            <span className="mt-2 text-[28px] leading-[1.2] text-[#FBF5E7]/70">{item.detail}</span>
          </m.li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Emergency — exits and the meeting point
// ---------------------------------------------------------------------------

export function Emergency({ params }: SceneProps<"emergency">) {
  const exits = splitList(params.exits).slice(0, 4);
  return (
    <>
      <div
        className="absolute inset-x-0 top-0 h-[40px]"
        style={{ background: `repeating-linear-gradient(135deg, ${BRAND.yellow} 0 40px, ${BRAND.black} 40px 80px)` }}
      />
      <Header eyebrow="Por si acaso" title="En caso de emergencia" />
      <ol className="absolute top-[340px] left-[140px] flex w-[900px] flex-col gap-[26px]">
        {exits.map((exit, i) => (
          <m.li
            key={`${i}-${exit}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
          >
            <span className="flex h-[96px] w-[96px] shrink-0 items-center justify-center bg-[#F5BB03] text-[48px] font-extrabold text-black">
              {i + 1}
            </span>
            <span className="text-[42px] leading-[1.15] font-semibold text-balance">{exit}</span>
          </m.li>
        ))}
      </ol>
      <div className="absolute top-[340px] right-[140px] flex w-[620px] flex-col gap-[20px]">
        <div className="bg-[#0162C8] px-9 py-8 text-[#FBF5E7]">
          <p className="text-[26px] font-bold tracking-[0.3em] uppercase opacity-80">Punto de encuentro</p>
          <p className="mt-2 text-[46px] leading-[1.1] font-extrabold text-balance">{params.meetingPoint}</p>
        </div>
        <div className="bg-[#FBF5E7]/[0.08] px-9 py-8">
          <p className="text-[26px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Avisá</p>
          <p className="mt-2 text-[36px] leading-[1.2] font-semibold text-balance">{params.contact}</p>
        </div>
        <div className="flex items-center gap-6 bg-[#F5BB03] px-9 py-6 text-black">
          <span className="text-[26px] font-bold tracking-[0.3em] uppercase">Emergencias</span>
          <span className="ml-auto text-[72px] leading-none font-extrabold tabular-nums">{params.phone}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Transport — how to get home
// ---------------------------------------------------------------------------

export function Transport({ params }: SceneProps<"transport">) {
  const columns = [
    { icon: "🚌", title: "Ómnibus", text: params.bus },
    { icon: "🚕", title: "Taxi · apps", text: params.taxi },
    { icon: "🚲", title: "Bici · a pie", text: params.bike },
  ];
  return (
    <>
      <Ambient />
      <Header eyebrow={params.address} title="¿Cómo volvés?" />
      <div className="absolute top-[330px] left-[340px] grid w-[1000px] grid-cols-1 gap-[18px]">
        {columns.map((column, i) => (
          <m.div
            key={column.title}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8 bg-[#FBF5E7]/[0.06] px-8 py-6"
            initial={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
          >
            <span className="text-[72px] leading-none">{column.icon}</span>
            <span>
              <span className="block text-[26px] font-bold tracking-[0.25em] text-[#F5BB03] uppercase">
                {column.title}
              </span>
              <span className="mt-1 block text-[34px] leading-[1.2] font-semibold text-balance">{column.text}</span>
            </span>
          </m.div>
        ))}
      </div>
      <div className="absolute top-[330px] right-[140px] flex w-[400px] flex-col items-center gap-5">
        <QrCode size={400} value={MAPS_URLS.meetupLocation} />
        <p className="text-center text-[26px] font-semibold text-[#FBF5E7]/70">Ubicación en Google Maps</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Food — the coffee break menu
// ---------------------------------------------------------------------------

export function Food({ params }: SceneProps<"food">) {
  const now = useNow(1000);
  const items = splitList(params.items).map(parseItem).slice(0, 8);
  const seconds = /^\d{1,2}:\d{2}$/.test(params.time) ? secondsUntil(params.time.padStart(5, "0")) : 0;
  const status = seconds > 0 ? `Empieza en ${formatTime(Math.min(seconds, 5999))}` : "Ahora";
  void now;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.time} · ${status}`} title={params.title} />
      <ul className="absolute top-[330px] right-[140px] left-[340px] grid grid-cols-2 gap-x-[40px] gap-y-[18px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item.name}`}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-7 border-b-[3px] border-[#FBF5E7]/15 py-5"
            initial={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
          >
            <span className="w-[80px] text-center text-[60px] leading-none">{item.icon || "•"}</span>
            <span>
              <span className="block text-[40px] leading-[1.1] font-extrabold">{item.name}</span>
              {item.detail && <span className="mt-1 block text-[28px] text-[#FBF5E7]/65">{item.detail}</span>}
            </span>
          </m.li>
        ))}
      </ul>
      <p className="absolute bottom-[90px] left-[340px] text-[30px] font-semibold text-[#FBF5E7]/60">{params.note}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Feedback — the satisfaction survey
// ---------------------------------------------------------------------------

export function Feedback({ params }: SceneProps<"feedback">) {
  return (
    <>
      <Ambient />
      <Header eyebrow="Tu opinión" title={params.title} />
      <div className="absolute top-[360px] left-[340px] w-[900px]">
        <div className="flex gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <m.span
              key={i}
              animate={{ opacity: [0.25, 1, 1, 0.25], scale: [0.9, 1.15, 1, 0.9] }}
              className="text-[150px] leading-none text-[#F5BB03]"
              transition={{ duration: 4, repeat: Infinity, delay: i * 0.3, times: [0, 0.15, 0.7, 1] }}
            >
              ★
            </m.span>
          ))}
        </div>
        <p className="mt-10 text-[48px] leading-[1.2] font-semibold text-balance text-[#FBF5E7]/85">
          {params.subtitle}
        </p>
        <p className="font-terminal mt-8 text-[32px] text-[#F5BB03]">{params.url.replace(/^https?:\/\//, "")}</p>
      </div>
      <div className="absolute top-[340px] right-[140px]">
        <QrCode size={440} value={params.url} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Checklist — before you leave
// ---------------------------------------------------------------------------

export function Checklist({ params }: SceneProps<"checklist">) {
  const items = splitList(params.items).slice(0, 6);
  return (
    <>
      <Ambient />
      <Header eyebrow="Casi terminamos" title={params.title} />
      <ul className="absolute top-[330px] right-[140px] left-[340px] flex flex-col gap-[22px]">
        {items.map((item, i) => (
          <m.li
            key={`${i}-${item}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
          >
            <span className="relative flex h-[84px] w-[84px] shrink-0 items-center justify-center border-[6px] border-[#FBF5E7]/60">
              <m.span
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-[-6px] flex items-center justify-center bg-[#F5BB03] text-[56px] font-extrabold text-black"
                initial={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.35, delay: 1.2 + i * 0.9, ease: EASE_OUT }}
              >
                ✓
              </m.span>
            </span>
            <span className="text-[46px] leading-[1.15] font-semibold text-balance">{item}</span>
          </m.li>
        ))}
      </ul>
    </>
  );
}
