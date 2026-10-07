"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { MAPS_URLS } from "app/lib/constants";
import { client } from "lib/orpc";
import type { SceneProps } from "lib/owy-stage/scenes";
import type { StageMeetup, StagePulse } from "lib/orpc/owy-stage/schemas";

import { Confetti } from "../effects";
import { Ambient, BRAND, StageContext } from "../Stage";
import { QrCode, Rise } from "./parts";

// ---------------------------------------------------------------------------
// Meetups — the community calendar (meetup-bot feed)
// ---------------------------------------------------------------------------

const TZ = "America/Montevideo";
const MEETUP_DAY = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", timeZone: TZ });
const MEETUP_WEEKDAY = new Intl.DateTimeFormat("es-UY", { weekday: "short", timeZone: TZ });
const MEETUP_TIME = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});
const clean = (s: string) => s.replace(/\./g, "").toUpperCase();

export function Meetups() {
  const [meetups, setMeetups] = useState<StageMeetup[] | null>(null);
  useEffect(() => {
    client.owyStage
      .getMeetups()
      .then(setMeetups)
      .catch(() => setMeetups([]));
  }, []);

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[120px] top-[150px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          La comunidad sigue
        </Rise>
        <Rise className="mt-3 text-[80px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          Próximos meetups
        </Rise>
      </div>
      <div className="absolute inset-x-[120px] top-[340px] grid grid-cols-2 gap-x-[60px] gap-y-[20px]">
        {(meetups ?? []).slice(0, 6).map((meetup, i) => {
          const date = new Date(meetup.datetime);
          return (
            <m.div
              key={meetup.url}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-7 border-l-[10px] border-[#0162C8] bg-[#FBF5E7]/[0.05] px-7 py-5"
              initial={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.55, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
            >
              <div className="w-[170px] shrink-0">
                <p className="text-[38px] leading-none font-extrabold text-[#F5BB03] uppercase">
                  {clean(MEETUP_DAY.format(date))}
                </p>
                <p className="mt-2 font-terminal text-[24px] text-[#FBF5E7]/60">
                  {clean(MEETUP_WEEKDAY.format(date))} · {MEETUP_TIME.format(date)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[24px] font-semibold tracking-[0.12em] text-[#FBF5E7]/60 uppercase">{meetup.name}</p>
                <p className="mt-1 line-clamp-2 text-[32px] leading-tight font-bold">{meetup.title}</p>
                {meetup.venue && <p className="mt-1 truncate text-[22px] text-[#FBF5E7]/55">{meetup.venue}</p>}
              </div>
            </m.div>
          );
        })}
        {meetups && meetups.length === 0 && (
          <p className="col-span-2 text-[48px] font-bold text-[#FBF5E7]/40">Sin meetups anunciados por ahora.</p>
        )}
      </div>
      <p className="absolute bottom-[70px] left-[120px] text-[28px] font-medium tracking-[0.2em] text-[#FBF5E7]/50 uppercase">
        owu.uy · toda la agenda de la comunidad tech uruguaya
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pulse — "somos N": live counts, aggregates only
// ---------------------------------------------------------------------------

export function Pulse({ params, eventId }: SceneProps<"pulse">) {
  const { preview } = useContext(StageContext);
  const [pulse, setPulse] = useState<StagePulse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      client.owyStage
        .getPulse({ eventId })
        .then((data) => {
          if (!cancelled) setPulse(data);
        })
        .catch((error) => console.error("[stage] pulse", error));
    load();
    if (preview) return;
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventId, preview]);

  const tickets = pulse?.tickets;
  const total = tickets ? (tickets.capacity ?? tickets.active) : 0;
  const ratio = tickets && total ? Math.min(1, tickets.checkedIn / total) : 0;

  return (
    <>
      <Ambient />
      <div className="absolute top-[190px] left-[140px] w-[900px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {params.title}
        </Rise>
        {tickets ? (
          <>
            <Rise className="countdown-font mt-4 text-[420px] leading-none tracking-wider text-[#F5BB03]" delay={0.15}>
              {tickets.checkedIn}
            </Rise>
            <Rise className="text-[56px] font-extrabold tracking-[-0.01em] uppercase" delay={0.35}>
              ya llegaron · {tickets.active} inscriptos
            </Rise>
          </>
        ) : pulse?.board ? (
          // No ticketing connected: the board is the headline instead.
          <>
            <Rise className="countdown-font mt-4 text-[420px] leading-none tracking-wider text-[#F5BB03]" delay={0.15}>
              {pulse.board.ideas}
            </Rise>
            <Rise className="text-[56px] font-extrabold tracking-[-0.01em] uppercase" delay={0.35}>
              ideas en la grilla · {pulse.board.rooms} salas
            </Rise>
          </>
        ) : (
          <Rise
            className="mt-6 text-[72px] leading-[0.98] font-extrabold tracking-[-0.02em] text-[#FBF5E7]/60 uppercase"
            delay={0.15}
          >
            {pulse ? "Elegí un evento en el admin" : "Contando…"}
          </Rise>
        )}
      </div>
      {tickets && (
        <div className="absolute top-[220px] right-[160px] h-[560px] w-[560px]">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 560 560">
            <circle cx="280" cy="280" fill="none" r="250" stroke="rgba(251,245,231,0.12)" strokeWidth="26" />
            <m.circle
              animate={{ pathLength: ratio }}
              cx="280"
              cy="280"
              fill="none"
              initial={{ pathLength: 0 }}
              r="250"
              stroke={BRAND.blue}
              strokeLinecap="round"
              strokeWidth="26"
              transition={{ duration: 1.4, ease: EASE_OUT }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[120px] leading-none font-extrabold">{Math.round(ratio * 100)}%</span>
            <span className="mt-2 text-[24px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase">
              de {total}
            </span>
          </div>
        </div>
      )}
      {tickets && pulse?.board && (
        <div className="absolute bottom-[90px] left-[140px] flex gap-[90px]">
          {[
            [pulse.board.ideas, "ideas en la grilla"],
            [pulse.board.rooms, "salas"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="countdown-font text-[140px] leading-none tracking-wider">{value}</p>
              <p className="text-[28px] font-semibold tracking-[0.15em] text-[#FBF5E7]/60 uppercase">{label}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Principles — the open space rules
// ---------------------------------------------------------------------------

const PRINCIPLES = [
  "Quienes vienen son las personas correctas",
  "Lo que pase es lo único que podía pasar",
  "Cuando empieza, es el momento",
  "Cuando termina, terminó",
];

export function Principles() {
  return (
    <>
      <Ambient />
      <div className="absolute top-[110px] left-[120px] w-[600px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Open Space
        </Rise>
        <Rise className="mt-4 text-[96px] leading-[0.95] font-extrabold tracking-[-0.02em] uppercase" delay={0.2}>
          Cuatro principios y una ley
        </Rise>
      </div>
      <ol className="absolute top-[120px] right-[120px] flex w-[1040px] flex-col gap-[26px]">
        {PRINCIPLES.map((principle, i) => (
          <m.li
            key={principle}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.15, ease: EASE_OUT }}
          >
            <span className="flex h-[86px] w-[86px] shrink-0 items-center justify-center rounded-full bg-[#F5BB03] text-[44px] font-extrabold text-black">
              {i + 1}
            </span>
            <span className="text-[44px] leading-[1.15] font-semibold text-balance">{principle}</span>
          </m.li>
        ))}
        <m.li
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 border-l-[12px] border-[#0162C8] bg-[#FBF5E7]/[0.06] px-8 py-6"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 1.1, ease: EASE_OUT }}
        >
          <p className="text-[26px] font-semibold tracking-[0.25em] text-[#0162C8] uppercase">Ley de los dos pies</p>
          <p className="mt-2 text-[40px] leading-[1.15] font-bold text-balance">
            Si no estás aprendiendo ni aportando, usá los pies: andá a otra charla.
          </p>
        </m.li>
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Owy card — the illustrated mascot
// ---------------------------------------------------------------------------

export function OwyCard({ params }: SceneProps<"owy-card">) {
  return (
    <>
      <Ambient />
      <m.div
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        className="absolute top-[160px] left-[200px] flex h-[760px] w-[640px] items-center justify-center rounded-full bg-[#F5BB03]"
        initial={{ opacity: 0, y: 60, rotate: 6 }}
        transition={{ duration: 0.9, ease: EASE_OUT }}
      >
        <m.img
          alt="Owy, el carpincho de OWU"
          animate={{ y: [0, -14, 0] }}
          className="w-[560px] drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)]"
          src="/images/logos/carpincho.png"
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </m.div>
      <div className="absolute top-[220px] right-[140px] w-[880px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.2}>
          Conocé a
        </Rise>
        <Rise className="mt-3 text-[220px] leading-none font-extrabold tracking-[-0.04em] uppercase" delay={0.3}>
          Owy
        </Rise>
        <Rise className="mt-6 text-[44px] leading-[1.25] font-medium text-balance text-[#FBF5E7]/85" delay={0.5}>
          {params.bio}
        </Rise>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// History — from La Meetup to OWU CONF
// ---------------------------------------------------------------------------

const EDITIONS = [
  { year: "2023", name: "La Meetup I" },
  { year: "2024", name: "La Meetup II" },
  { year: "2025", name: "La Meetup III" },
  { year: "2026", name: "OWU CONF" },
];

export function History() {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-0 top-[140px] text-center">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          De La Meetup a OWU CONF
        </Rise>
        <Rise className="mt-3 text-[80px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          Cuatro años de comunidad
        </Rise>
      </div>
      <div className="absolute top-[590px] right-[160px] left-[160px] h-[14px] bg-[#FBF5E7]/15">
        <m.div
          animate={{ scaleX: 1 }}
          className="h-full origin-left bg-[#F5BB03]"
          initial={{ scaleX: 0 }}
          transition={{ duration: 2.2, delay: 0.5, ease: "easeInOut" }}
        />
      </div>
      <div className="absolute inset-x-[160px] top-[470px] grid grid-cols-4">
        {EDITIONS.map((edition, i) => {
          const isConf = edition.name === "OWU CONF";
          return (
            <m.div
              key={edition.year}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.6, delay: 0.6 + i * 0.5, ease: EASE_OUT }}
            >
              <span className={`text-[60px] font-extrabold tabular-nums ${isConf ? "text-[#F5BB03]" : ""}`}>
                {edition.year}
              </span>
              <span
                className={`mt-[22px] h-[54px] w-[54px] rounded-full border-[8px] ${isConf ? "border-[#F5BB03] bg-[#F5BB03]" : "border-[#F5BB03] bg-black"}`}
              />
              <span
                className={`mt-[26px] text-center leading-none font-extrabold tracking-[-0.02em] uppercase ${isConf ? "text-[72px] text-[#F5BB03]" : "text-[48px]"}`}
              >
                {edition.name}
              </span>
              {isConf && (
                <span className="mt-4 text-[26px] font-semibold tracking-[0.2em] text-[#FBF5E7]/60 uppercase">
                  07 · 11 · Sinergia Faro
                </span>
              )}
            </m.div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Venue — where we are, with a map QR
// ---------------------------------------------------------------------------

export function Venue({ params }: SceneProps<"venue">) {
  return (
    <>
      <Ambient />
      <div className="absolute top-[220px] left-[140px] w-[980px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Estamos en
        </Rise>
        <Rise
          className="mt-4 text-[150px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase"
          delay={0.15}
        >
          {params.name}
        </Rise>
        <div className="mt-10 flex items-start gap-6">
          <svg
            className="mt-2 h-[52px] w-[52px] shrink-0"
            fill="none"
            stroke={BRAND.yellow}
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11Z" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2.6" />
          </svg>
          <Rise className="text-[48px] leading-[1.2] font-medium text-[#FBF5E7]/85" delay={0.4}>
            {params.address}
          </Rise>
        </div>
      </div>
      <m.div
        animate={{ opacity: 1, scale: 1 }}
        className="absolute top-[270px] right-[180px] text-center"
        initial={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT }}
      >
        <QrCode size={440} value={params.mapUrl || MAPS_URLS.meetupLocation} />
        <p className="mt-6 text-[26px] font-semibold tracking-[0.25em] text-[#FBF5E7]/60 uppercase">Cómo llegar</p>
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Selfie spot
// ---------------------------------------------------------------------------

export function Selfie({ params }: SceneProps<"selfie">) {
  const corner = "absolute h-[160px] w-[160px] border-[#F5BB03]";
  return (
    <>
      <Ambient />
      <div className={`${corner} top-[90px] left-[100px] border-t-[18px] border-l-[18px]`} />
      <div className={`${corner} top-[90px] right-[100px] border-t-[18px] border-r-[18px]`} />
      <div className={`${corner} bottom-[90px] left-[100px] border-b-[18px] border-l-[18px]`} />
      <div className={`${corner} right-[100px] bottom-[90px] border-r-[18px] border-b-[18px]`} />
      <div className="absolute inset-x-0 top-[130px] text-center">
        <Rise className="text-[40px] font-semibold tracking-[0.3em] text-[#FBF5E7]/70 uppercase" delay={0.05}>
          Sacate una foto acá
        </Rise>
      </div>
      <div className="absolute inset-x-0 bottom-[130px] text-center">
        <Rise
          className="text-[190px] leading-none font-extrabold tracking-[-0.03em] text-[#F5BB03] uppercase"
          delay={0.2}
        >
          {params.hashtag}
        </Rise>
        <Rise className="mt-4 text-[40px] font-medium tracking-[0.15em] text-[#FBF5E7]/70 uppercase" delay={0.4}>
          {params.line}
        </Rise>
      </div>
      <img
        alt="OWU CONF"
        className="absolute top-[300px] left-1/2 w-[560px] -translate-x-1/2 opacity-90"
        src="/images/logos/conf.webp"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Raffle — spin through names, land on one
// ---------------------------------------------------------------------------

export function Raffle({ params }: SceneProps<"raffle">) {
  const { preview } = useContext(StageContext);
  const names = useMemo(
    () =>
      params.names
        .split(/[,\n;]/)
        .map((name) => name.trim())
        .filter(Boolean),
    [params.names]
  );
  const winner = useMemo(() => (names.length ? Math.floor(Math.random() * names.length) : -1), [names]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(preview);

  useEffect(() => {
    if (preview || names.length < 2) {
      setIndex(Math.max(0, winner));
      setDone(true);
      return;
    }
    setDone(false);
    let step = 0;
    let delay = 60;
    let timer: ReturnType<typeof setTimeout>;
    const spins = 34 + ((winner - 0) % names.length);
    const tick = () => {
      step++;
      setIndex((i) => (i + 1) % names.length);
      if (step >= spins) {
        // Land exactly on the winner after the deceleration.
        setIndex(winner);
        setDone(true);
        return;
      }
      delay = step > spins - 10 ? delay * 1.32 : delay;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [names, winner, preview]);

  const current = names[index] ?? "—";

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[120px] top-[150px] text-center">
        <Rise className="text-[40px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {params.title}
        </Rise>
      </div>
      <div className="absolute inset-x-[120px] top-[330px] flex h-[420px] items-center justify-center overflow-hidden border-y-[10px] border-[#FBF5E7]/20">
        <AnimatePresence mode="popLayout">
          <m.p
            key={`${index}-${done}`}
            animate={{ y: 0, opacity: 1, scale: done ? 1.08 : 1 }}
            className={`text-center leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase ${
              current.length > 18 ? "text-[120px]" : "text-[190px]"
            } ${done ? "text-[#F5BB03]" : ""}`}
            exit={{ y: -80, opacity: 0, transition: { duration: 0.12 } }}
            initial={{ y: 80, opacity: 0 }}
            transition={{ duration: done ? 0.5 : 0.12, ease: EASE_OUT }}
          >
            {current}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="absolute inset-x-0 top-[800px] text-center text-[40px] font-semibold tracking-[0.25em] text-[#FBF5E7]/60 uppercase">
        {names.length < 2
          ? "Cargá nombres separados por coma"
          : done
            ? "¡Felicitaciones!"
            : `${names.length} participantes`}
      </div>
      {done && !preview && names.length > 1 && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti />
          <Confetti />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Welcome — the crowd photo with the big greeting
// ---------------------------------------------------------------------------

export function Welcome({ params }: SceneProps<"welcome">) {
  return (
    <>
      <m.img
        alt=""
        animate={{ scale: 1.08, opacity: 1 }}
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ scale: 1, opacity: 0 }}
        src="/images/conf/hero-crowd.webp"
        transition={{ opacity: { duration: 1.2 }, scale: { duration: 40, ease: "linear" } }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20" />
      <div className="absolute inset-x-[120px] bottom-[120px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.4}>
          {params.eyebrow}
        </Rise>
        <Rise
          className="mt-4 text-[170px] leading-[0.92] font-extrabold tracking-[-0.03em] text-balance uppercase"
          delay={0.55}
        >
          {params.title}
        </Rise>
      </div>
      <img alt="OWU CONF" className="absolute top-[80px] right-[120px] w-[420px]" src="/images/logos/conf.webp" />
    </>
  );
}
