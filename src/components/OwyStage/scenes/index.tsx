"use client";

import { useContext, useEffect, useState, type ComponentType } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useCountdownState } from "hooks/useCountdownState";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type StickyNote } from "lib/orpc";
import type { SceneId, SceneProps } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { formatTime } from "lib/utils";

import { Ambient, BRAND, StageContext } from "../Stage";
import OwyFace from "./OwyFace";
import { Days, Ideas, Kaleidoscope, Launch, OwyTalks, Sponsor, Talk, Tangram, Terminal, Ticker } from "./creative";
import {
  Applause,
  Board,
  Marquee,
  Numbers,
  Questions,
  Quote,
  Rain,
  RoomsNow,
  Speaker,
  SponsorWall,
  Until,
  Warp,
} from "./extra";
import { After, Block, Cams, Community, Frame, Promo, Qr, Silence } from "./legacy";
import { Agenda, Clock, Closing, LowerThird, Moments, Shapes, Team } from "./more";
import { Alert, CastBar, Next, OwyHowTo, Photo, Program, RoomDay, Social, Steps, Wifi } from "./useful";
import { DATE_LABEL, LogoReveal, Rise, SponsorRow } from "./parts";

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function Black() {
  return null;
}

function Logo() {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    let off: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setGlitch(true);
      off = setTimeout(() => setGlitch(false), 400);
    }, 7000);
    return () => {
      clearInterval(id);
      clearTimeout(off);
    };
  }, []);

  return (
    <>
      <Ambient />
      <div className="absolute top-[414px] left-[360px]">
        <div className={`animate-float ${glitch ? "animate-glitch" : ""}`}>
          <LogoReveal />
        </div>
      </div>
      <m.p
        animate={{ opacity: 1, y: 0 }}
        className="absolute right-0 bottom-[110px] left-0 text-center text-[34px] font-semibold tracking-[0.3em] text-[#FBF5E7]/70 uppercase"
        initial={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.8, delay: 1, ease: EASE_OUT }}
      >
        conf.owu.uy
      </m.p>
    </>
  );
}

function Opening() {
  return (
    <>
      <Ambient />
      <div className="absolute top-[300px] left-[360px]">
        <LogoReveal delay={0.6} />
      </div>
      <div className="absolute top-[700px] right-0 left-0 text-center">
        <Rise
          className="text-[64px] leading-none font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase"
          delay={1.6}
        >
          {DATE_LABEL}
        </Rise>
        <Rise className="mt-3 text-[40px] font-medium tracking-[0.12em] text-[#FBF5E7]/85 uppercase" delay={2}>
          Sinergia Faro · Montevideo
        </Rise>
      </div>
      <m.div
        animate={{ scaleX: 1 }}
        className="absolute bottom-[96px] left-[360px] h-[14px] w-[1200px] origin-left bg-[#F5BB03]"
        initial={{ scaleX: 0 }}
        transition={{ duration: 0.9, delay: 2.6, ease: EASE_OUT }}
      />
    </>
  );
}

function Message({ params }: SceneProps<"message">) {
  const long = params.title.length > 24;

  return (
    <>
      <Ambient />
      <div key={params.title} className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center">
        <Rise
          className={`leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase ${long ? "text-[120px]" : "text-[150px]"}`}
          delay={0.1}
        >
          {params.title}
        </Rise>
        {params.subtitle && (
          <Rise className="mt-8 font-sans text-[48px] font-medium text-[#FBF5E7]/80" delay={0.45}>
            {params.subtitle}
          </Rise>
        )}
      </div>
    </>
  );
}

function UpNext({ eventId }: SceneProps<"up-next">) {
  const { preview } = useContext(StageContext);
  const [note, setNote] = useState<StickyNote | null>(null);

  useEffect(() => {
    if (!eventId) return;
    client.cast
      .getState({ eventId })
      .then((state) => setNote(state.note))
      .catch((error) => console.error("[stage] cast state", error));
  }, [eventId]);

  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "cast") : null, (event, payload) => {
    if (event === "note_highlighted") setNote((payload as { note: StickyNote | null }).note);
  });

  return (
    <>
      <Ambient />
      <div className="absolute top-[200px] right-[200px] left-[340px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          A continuación
        </Rise>
        {note ? (
          <div key={note.id}>
            <Rise
              className={`mt-8 leading-[0.98] font-extrabold tracking-[-0.02em] text-balance uppercase ${note.title.length > 40 ? "text-[88px]" : "text-[120px]"}`}
              delay={0.2}
            >
              {note.title}
            </Rise>
            {note.speaker && (
              <Rise className="mt-8 text-[56px] font-medium text-[#FBF5E7]/85" delay={0.45}>
                {note.speaker}
              </Rise>
            )}
            <m.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 flex items-center gap-8 text-[38px] font-semibold tracking-[0.08em] uppercase"
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.7, ease: EASE_OUT }}
            >
              <span className="flex items-center gap-4 border-2 border-[#FBF5E7]/25 px-8 py-4">
                <span className="h-[22px] w-[22px] rounded-full" style={{ background: note.roomColor ?? BRAND.blue }} />
                {note.room}
              </span>
              <span className="border-2 border-[#FBF5E7]/25 px-8 py-4 text-[#F5BB03]">{note.timeSlot}</span>
            </m.div>
          </div>
        ) : (
          <Rise className="mt-8 text-[80px] leading-none font-extrabold text-[#FBF5E7]/40 uppercase" delay={0.2}>
            {eventId ? "Esperando una charla…" : "Elegí un evento en el admin"}
          </Rise>
        )}
      </div>
    </>
  );
}

function Sponsors() {
  return (
    <>
      <Ambient />
      <div className="absolute top-[150px] right-0 left-0 text-center">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Empresas
        </Rise>
        <Rise className="mt-4 text-[110px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.2}>
          Nos acompañan
        </Rise>
      </div>
      <m.div
        animate={{ opacity: 1 }}
        className="absolute top-[620px] right-0 left-0 flex flex-col gap-[60px]"
        initial={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <SponsorRow />
        <SponsorRow reverse />
      </m.div>
    </>
  );
}

function CountdownClock({ eventId, label }: { eventId: string; label: string }) {
  const { preview } = useContext(StageContext);
  const { state, loading } = useCountdownState({ eventId, enableRealtime: !preview });
  const done = state.remainingSeconds === 0;

  return (
    <>
      {label && (
        <Rise
          className="absolute top-[150px] right-0 left-0 text-center text-[56px] font-semibold tracking-[0.25em] text-[#FBF5E7]/80 uppercase"
          delay={0.1}
        >
          {label}
        </Rise>
      )}
      <div
        className={`countdown-font absolute top-1/2 right-0 left-0 -translate-y-1/2 text-center text-[420px] leading-none tracking-wider select-none ${
          done ? "text-red-500" : `text-[#F5BB03] ${state.isRunning ? "animate-timer-pulse" : "opacity-80"}`
        }`}
      >
        {loading ? "00:00" : formatTime(state.remainingSeconds)}
      </div>
    </>
  );
}

function CountdownScene({ params, eventId }: SceneProps<"countdown">) {
  return (
    <>
      <Ambient />
      {eventId ? (
        <CountdownClock eventId={eventId} label={params.label} />
      ) : (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[64px] font-extrabold text-[#FBF5E7]/40 uppercase">
          Elegí un evento en el admin
        </p>
      )}
    </>
  );
}

export const SCENE_COMPONENTS: { [K in SceneId]: ComponentType<SceneProps<K>> } = {
  "owy-face": OwyFace,
  logo: Logo,
  opening: Opening,
  message: Message,
  "up-next": UpNext,
  sponsors: Sponsors,
  countdown: CountdownScene,
  agenda: Agenda,
  moments: Moments,
  "lower-third": LowerThird,
  clock: Clock,
  closing: Closing,
  shapes: Shapes,
  team: Team,
  launch: Launch,
  terminal: Terminal,
  ideas: Ideas,
  tangram: Tangram,
  kaleidoscope: Kaleidoscope,
  "owy-talks": OwyTalks,
  ticker: Ticker,
  talk: Talk,
  sponsor: Sponsor,
  days: Days,
  program: Program,
  next: Next,
  room: RoomDay,
  "cast-bar": CastBar,
  wifi: Wifi,
  alert: Alert,
  steps: Steps,
  "owy-howto": OwyHowTo,
  social: Social,
  photo: Photo,
  block: Block,
  cams: Cams,
  community: Community,
  silence: Silence,
  promo: Promo,
  qr: Qr,
  after: After,
  frame: Frame,
  board: Board,
  "rooms-now": RoomsNow,
  marquee: Marquee,
  until: Until,
  quote: Quote,
  "sponsor-wall": SponsorWall,
  applause: Applause,
  speaker: Speaker,
  numbers: Numbers,
  rain: Rain,
  warp: Warp,
  qa: Questions,
  black: Black,
};
