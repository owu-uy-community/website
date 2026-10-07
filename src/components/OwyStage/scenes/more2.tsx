"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { client } from "lib/orpc";
import type { StageSpeaker } from "lib/orpc/owy-stage/schemas";
import type { SpotifyTrack } from "lib/owy-stage/spotify";
import type { SceneProps } from "lib/owy-stage/scenes";
import { roomIconFor } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Ambient, BRAND, StageContext, useStageFrame } from "../Stage";
import { QrCode, Rise } from "./parts";
import { Header, splitList } from "./service";
import { EmptyText, parseProgram, useBoard, useNow } from "./useful";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const COLORS = [BRAND.yellow, BRAND.cream, BRAND.blue];

// ---------------------------------------------------------------------------
// Hosts — everyone facilitating a session today, live from the board
// ---------------------------------------------------------------------------

export function Hosts({ eventId }: SceneProps<"hosts">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const counts = new Map<string, number>();
  for (const track of data.tracks) {
    const name = track.speaker?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const hosts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  if (!hosts.length) return <EmptyText text="Todavía nadie propuso una sesión" />;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${hosts.length} personas · ${data.tracks.length} sesiones`} title="Hoy facilitan" />
      <ul className="absolute top-[320px] right-[140px] left-[340px] flex flex-wrap content-start gap-x-[34px] gap-y-[14px]">
        {hosts.map(([name, n], i) => (
          <m.li
            key={name}
            animate={{ opacity: 1, y: 0 }}
            className="leading-none font-extrabold"
            initial={{ opacity: 0, y: 20 }}
            style={{ fontSize: n > 1 ? 64 : 48, color: COLORS[i % 3] }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.05, ease: EASE_OUT }}
          >
            {name}
            {n > 1 && <span className="ml-2 align-top text-[24px] text-[#FBF5E7]/60">×{n}</span>}
          </m.li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Room cards — the rooms as door signs, from the DB
// ---------------------------------------------------------------------------

export function RoomCards({ eventId }: SceneProps<"room-cards">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const rooms = data.rooms.filter((room) => room.isActive).slice(0, 6);
  if (!rooms.length) return <EmptyText text="Sin salas cargadas" />;
  const cols = rooms.length <= 3 ? rooms.length : 3;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${rooms.length} salas`} title="Las salas" />
      <ul
        className="absolute top-[320px] right-[140px] left-[340px] grid gap-[20px]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {rooms.map((room, i) => {
          const color = roomColorFor(room.id, room.color);
          const Icon = roomIconFor(room.icon);
          const sessions = data.tracks.filter((track) => track.roomId === room.id).length;
          return (
            <m.li
              key={room.id}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-h-[250px] flex-col justify-between p-7 text-black"
              initial={{ opacity: 0, y: 30 }}
              style={{ background: color }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
            >
              <div className="flex items-start justify-between">
                <p className="text-[46px] leading-[1] font-extrabold uppercase">{room.name}</p>
                {Icon && <Icon className="h-[56px] w-[56px] shrink-0" strokeWidth={2.5} />}
              </div>
              {room.description && (
                <p className="mt-3 line-clamp-2 text-[24px] leading-[1.2] text-black/70">{room.description}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-[22px] font-bold">
                {room.capacity && <span className="bg-black/15 px-3 py-1">👥 {room.capacity}</span>}
                {room.hasTV && <span className="bg-black/15 px-3 py-1">📺 pantalla</span>}
                {room.hasWhiteboard && <span className="bg-black/15 px-3 py-1">🖊️ pizarra</span>}
                <span className="bg-black/15 px-3 py-1">{sessions} sesiones</span>
              </div>
            </m.li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Topics — what people are talking about, from the session titles
// ---------------------------------------------------------------------------

const STOP = new Set(
  "de la el los las y en un una con para por del al a o e que como sin sobre es se lo su sus mi tu the of and to in on for with vs".split(
    " "
  )
);

export function Topics({ eventId }: SceneProps<"topics">) {
  const { preview } = useContext(StageContext);
  const data = useBoard(eventId, preview);
  const layout = useMemo(
    () => Array.from({ length: 40 }, () => ({ tilt: rand(-6, 6), color: COLORS[Math.floor(rand(0, 3))] })),
    []
  );
  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  const counts = new Map<string, number>();
  for (const track of data.tracks) {
    for (const raw of track.title.split(/[^\p{L}\p{N}+#.]+/u)) {
      const word = raw.replace(/^[.]+|[.]+$/g, "");
      if (word.length < 3 || STOP.has(word.toLowerCase())) continue;
      const key = word.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const words = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
  if (!words.length) return <EmptyText text="Todavía no hay sesiones" />;
  const max = words[0][1];

  return (
    <>
      <Ambient />
      <Header eyebrow={`${data.tracks.length} sesiones`} title="De qué se habla hoy" />
      <div className="absolute top-[300px] right-[140px] left-[340px] flex flex-wrap items-center justify-center gap-x-[30px] gap-y-[6px]">
        {words.map(([word, n], i) => (
          <m.span
            key={word}
            animate={{ opacity: 1, scale: 1, rotate: layout[i % layout.length].tilt }}
            className="leading-[1.1] font-extrabold"
            initial={{ opacity: 0, scale: 0.6 }}
            style={{ fontSize: 34 + (n / max) * 80, color: layout[i % layout.length].color }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.04, ease: EASE_OUT }}
          >
            {word}
          </m.span>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Links — several QRs at once
// ---------------------------------------------------------------------------

export function Links({ params }: SceneProps<"links">) {
  const links = splitList(params.lines)
    .map((line) => {
      const at = line.indexOf(":");
      return at > 0 ? { label: line.slice(0, at).trim(), url: line.slice(at + 1).trim() } : null;
    })
    .filter((link): link is { label: string; url: string } => link !== null && /^https?:\/\//.test(link.url))
    .slice(0, 4);

  return (
    <>
      <Ambient />
      <Header eyebrow="Escaneá" title={params.title} />
      <div className="absolute top-[330px] right-[140px] left-[340px] flex justify-center gap-[40px]">
        {links.map((link, i) => (
          <m.div
            key={link.url}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
          >
            <QrCode size={300} value={link.url} />
            <p className="mt-5 text-[34px] font-extrabold uppercase">{link.label}</p>
            <p className="mt-1 max-w-[300px] truncate font-terminal text-[20px] text-[#FBF5E7]/55">
              {link.url.replace(/^https?:\/\/(www\.)?/, "")}
            </p>
          </m.div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wi-Fi QR — join the network by scanning
// ---------------------------------------------------------------------------

const wifiEscape = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");

export function WifiQr({ params }: SceneProps<"wifi-qr">) {
  const payload = `WIFI:T:${params.password ? "WPA" : "nopass"};S:${wifiEscape(params.network)};${params.password ? `P:${wifiEscape(params.password)};` : ""};`;
  return (
    <>
      <Ambient />
      <Header eyebrow="Conectate" title="Wi-Fi" />
      <div className="absolute top-[340px] left-[340px] w-[860px]">
        <p className="text-[28px] font-bold tracking-[0.3em] text-[#FBF5E7]/60 uppercase">Red</p>
        <p className="text-[84px] leading-[1.05] font-extrabold break-words">{params.network}</p>
        {params.password && (
          <>
            <p className="mt-8 text-[28px] font-bold tracking-[0.3em] text-[#FBF5E7]/60 uppercase">Contraseña</p>
            <p className="font-terminal text-[72px] leading-[1.05] break-all text-[#F5BB03]">{params.password}</p>
          </>
        )}
        <p className="mt-10 text-[30px] font-semibold text-[#FBF5E7]/70">
          O apuntá la cámara al código: el celular se conecta solo.
        </p>
      </div>
      <div className="absolute top-[320px] right-[140px]">
        <QrCode size={460} value={payload} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Alumni — people who spoke at OWU before (keystatic speakers)
// ---------------------------------------------------------------------------

export function Alumni() {
  const [speakers, setSpeakers] = useState<StageSpeaker[] | null>(null);
  useEffect(() => {
    client.owyStage
      .getSpeakers()
      .then(setSpeakers)
      .catch(() => setSpeakers([]));
  }, []);
  if (!speakers) return <Ambient />;
  if (!speakers.length) return <EmptyText text="Sin speakers cargados" />;
  const shown = speakers.slice(0, 12);
  const cols = shown.length <= 4 ? shown.length : shown.length <= 8 ? 4 : 6;

  return (
    <>
      <Ambient />
      <Header eyebrow="Ya pasaron por acá" title="Speakers de OWU" />
      <ul
        className="absolute top-[320px] right-[140px] left-[340px] grid gap-[22px]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {shown.map((speaker, i) => (
          <m.li
            key={speaker.slug}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
          >
            {speaker.picture ? (
              <img
                alt=""
                className="h-[190px] w-[190px] rounded-full object-cover ring-[6px] ring-[#F5BB03]"
                src={speaker.picture}
              />
            ) : (
              <span className="flex h-[190px] w-[190px] items-center justify-center rounded-full bg-[#0162C8] text-[72px] font-extrabold">
                {speaker.name[0]}
              </span>
            )}
            <p className="mt-4 text-[28px] leading-[1.1] font-extrabold">{speaker.name}</p>
            {speaker.role && (
              <p className="mt-1 line-clamp-2 text-[20px] leading-[1.2] text-[#FBF5E7]/60">{speaker.role}</p>
            )}
          </m.li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Breathe — a minute between blocks
// ---------------------------------------------------------------------------

export function Breathe({ params }: SceneProps<"breathe">) {
  const cycle = 14; // 4 in · 4 hold · 6 out
  const [phase, setPhase] = useState("Inhalá");
  useStageFrame((t) => {
    const at = (t / 1000) % cycle;
    const next = at < 4 ? "Inhalá" : at < 8 ? "Sostené" : "Exhalá";
    setPhase((p) => (p === next ? p : next));
  });

  return (
    <div className="absolute inset-0 bg-black">
      <p className="absolute inset-x-0 top-[90px] text-center text-[34px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">
        {params.title}
      </p>
      <div className="absolute inset-0 flex items-center justify-center">
        <m.div
          animate={{ scale: [1, 1.7, 1.7, 1], opacity: [0.6, 1, 1, 0.6] }}
          className="h-[340px] w-[340px] rounded-full bg-[#0162C8]"
          transition={{ duration: cycle, repeat: Infinity, ease: "easeInOut", times: [0, 4 / cycle, 8 / cycle, 1] }}
        />
        <m.div
          animate={{ scale: [1, 1.7, 1.7, 1] }}
          className="absolute h-[340px] w-[340px] rounded-full border-[6px] border-[#F5BB03]"
          transition={{ duration: cycle, repeat: Infinity, ease: "easeInOut", times: [0, 4 / cycle, 8 / cycle, 1] }}
        />
        <AnimatePresence mode="wait">
          <m.p
            key={phase}
            animate={{ opacity: 1 }}
            className="absolute z-10 text-[72px] font-extrabold text-[#FBF5E7] uppercase"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {phase}
          </m.p>
        </AnimatePresence>
      </div>
      <p className="absolute inset-x-0 bottom-[90px] text-center text-[36px] font-semibold text-[#FBF5E7]/60">
        {params.subtitle}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bingo — the conference card, marking itself
// ---------------------------------------------------------------------------

const LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function Bingo({ params }: SceneProps<"bingo">) {
  const { preview } = useContext(StageContext);
  const phrases = useMemo(() => splitList(params.phrases), [params.phrases]);
  const [round, setRound] = useState(0);
  const cells = useMemo(() => {
    const pool = [...phrases].sort(() => Math.random() - 0.5).slice(0, 24);
    while (pool.length < 24) pool.push("…");
    pool.splice(12, 0, "OWU");
    return pool;
  }, [phrases, round]);
  const [marked, setMarked] = useState<Set<number>>(() => new Set([12]));
  const bingo = LINES.some((line) => line.every((i) => marked.has(i)));

  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => {
      setMarked((current) => {
        if (LINES.some((line) => line.every((i) => current.has(i)))) return current;
        const free = cells.map((_, i) => i).filter((i) => !current.has(i));
        if (!free.length) return current;
        return new Set([...current, free[Math.floor(Math.random() * free.length)]]);
      });
    }, 3500);
    return () => clearInterval(id);
  }, [cells, preview]);

  useEffect(() => {
    if (!bingo || preview) return;
    const id = setTimeout(() => {
      setMarked(new Set([12]));
      setRound((r) => r + 1);
    }, 6000);
    return () => clearTimeout(id);
  }, [bingo, preview]);

  return (
    <>
      <Ambient />
      <Header eyebrow="Marcá lo que escuches" title={params.title} />
      <div className="absolute top-[120px] right-[140px] grid w-[880px] grid-cols-5 gap-[8px]">
        {cells.map((cell, i) => {
          const on = marked.has(i);
          return (
            <m.div
              key={`${round}-${i}`}
              animate={{
                background: on ? BRAND.yellow : "rgba(251,245,231,0.08)",
                color: on ? "#000" : BRAND.cream,
                scale: on ? 1 : 0.98,
              }}
              className={`flex h-[168px] items-center justify-center p-3 text-center leading-[1.1] font-bold text-balance ${i === 12 ? "text-[44px]" : "text-[24px]"}`}
              transition={{ duration: 0.4 }}
            >
              {cell}
            </m.div>
          );
        })}
      </div>
      <AnimatePresence>
        {bingo && (
          <m.p
            animate={{ opacity: 1, scale: 1, rotate: -6 }}
            className="absolute top-[520px] left-[120px] bg-[#0162C8] px-10 py-4 text-[120px] leading-none font-extrabold text-[#FBF5E7] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={{ opacity: 0, scale: 0.5, rotate: -6 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            ¡BINGO!
          </m.p>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Now playing — the break playlist card
// ---------------------------------------------------------------------------

/** Polls Spotify through the site every few seconds; `null` when nothing is playing. */
function useSpotify(enabled: boolean) {
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      client.owyStage
        .getSpotify()
        .then((next) => {
          if (!cancelled) setTrack(next);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
  // Extrapolate between polls so the bar moves smoothly.
  useStageFrame(() => {
    if (!track) return;
    const ahead = track.isPlaying ? Date.now() - new Date(track.at).getTime() : 0;
    const p = Math.min(1, (track.progressMs + ahead) / Math.max(1, track.durationMs));
    setProgress((v) => (Math.abs(v - p) < 0.002 ? v : p));
  });
  return { track, progress };
}

export function NowPlaying({ params }: SceneProps<"now-playing">) {
  const { preview } = useContext(StageContext);
  const { track, progress } = useSpotify(params.spotify && !preview);
  const song = track?.song ?? params.song;
  const artist = track?.artist ?? params.artist;
  const playing = !track || track.isPlaying;

  return (
    <>
      <Ambient />
      <div className="absolute top-[290px] left-[340px] flex items-center gap-[70px]">
        <div className="relative flex h-[440px] w-[440px] items-center justify-center">
          <m.div
            animate={{ rotate: playing ? 360 : 0 }}
            className="h-full w-full rounded-full"
            style={{ background: `repeating-radial-gradient(circle, ${BRAND.black} 0 6px, #1b1b1b 6px 9px)` }}
            transition={playing ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.5 }}
          />
          <m.div
            animate={{ rotate: playing ? 360 : 0 }}
            className="absolute flex h-[190px] w-[190px] items-center justify-center overflow-hidden rounded-full bg-[#F5BB03] text-[22px] font-extrabold text-black"
            transition={playing ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.5 }}
          >
            OWU
            {track?.art && (
              // Sits over the label; a broken cover just leaves the label visible.
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => e.currentTarget.remove()}
                src={track.art}
              />
            )}
          </m.div>
          <span className="absolute h-[22px] w-[22px] rounded-full bg-black" />
        </div>
        <div className="w-[860px]">
          <p className="text-[28px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">
            {track ? (track.isPlaying ? "♪ Sonando en Spotify" : "⏸ En pausa") : `♪ Sonando · ${params.playlist}`}
          </p>
          <AnimatePresence mode="wait">
            <m.div
              key={song}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4 }}
            >
              <p className="mt-4 line-clamp-2 text-[84px] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance">
                {song}
              </p>
              <p className="mt-4 truncate text-[44px] font-semibold text-[#FBF5E7]/70">
                {artist}
                {track?.album && <span className="text-[#FBF5E7]/40"> · {track.album}</span>}
              </p>
            </m.div>
          </AnimatePresence>
          <div className="mt-10 flex h-[60px] items-end gap-[8px]">
            {Array.from({ length: 24 }, (_, i) => (
              <m.span
                key={i}
                animate={playing ? { height: [12, rand(24, 60), 16, rand(30, 60), 12] } : { height: 12 }}
                className="w-[14px] bg-[#0162C8]"
                transition={
                  playing ? { duration: rand(0.8, 1.6), repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute right-[140px] bottom-[110px] left-[340px]">
        <div className="h-[10px] bg-[#FBF5E7]/15">
          {track ? (
            <div className="h-full bg-[#F5BB03]" style={{ width: `${progress * 100}%` }} />
          ) : (
            <m.div
              animate={{ width: "100%" }}
              className="h-full bg-[#F5BB03]"
              initial={{ width: "0%" }}
              transition={{ duration: 210, repeat: Infinity, ease: "linear" }}
            />
          )}
        </div>
        {track && (
          <div className="mt-3 flex justify-between font-terminal text-[24px] text-[#FBF5E7]/50 tabular-nums">
            <span>{formatTime(Math.floor((progress * track.durationMs) / 1000))}</span>
            <span>{formatTime(Math.floor(track.durationMs / 1000))}</span>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Departures — the programme on a split-flap board
// ---------------------------------------------------------------------------

const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·ÁÉÍÓÚÑ+";

type FlapTone = "default" | "on" | "next";
const FLAP_TONE: Record<FlapTone, string> = {
  default: "bg-[#1c1c1c] text-[#FBF5E7]",
  on: "bg-[#F5BB03] text-black",
  next: "bg-[#1c1c1c] text-[#F5BB03]",
};

function Flap({
  text,
  width,
  delay,
  tone = "default",
}: {
  text: string;
  width: number;
  delay: number;
  tone?: FlapTone;
}) {
  const target = text.toUpperCase().padEnd(width).slice(0, width);
  const [shown, setShown] = useState(target);
  const start = useRef<number | null>(null);
  const goal = useRef(target);
  if (goal.current !== target) {
    goal.current = target;
    start.current = null;
  }

  useStageFrame((t) => {
    if (start.current === null) start.current = t + delay;
    const elapsed = t - start.current;
    let out = "";
    for (let i = 0; i < width; i++) {
      // Each cell keeps flipping until its own moment, left to right.
      const settleAt = i * 55 + 320;
      out +=
        elapsed >= settleAt
          ? goal.current[i]
          : (FLAP_CHARS[Math.floor((elapsed / 45 + i * 3) % FLAP_CHARS.length)] ?? " ");
    }
    setShown((prev) => (prev === out ? prev : out));
  });

  return (
    <span className="flex gap-[3px]">
      {shown.split("").map((ch, i) => (
        <span
          key={i}
          className={`relative flex h-[76px] w-[42px] items-center justify-center font-terminal text-[42px] font-bold ${FLAP_TONE[tone]}`}
        >
          {ch}
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] bg-black" />
        </span>
      ))}
    </span>
  );
}

export function Departures({ params }: SceneProps<"departures">) {
  const now = useNow(1000);
  const program = useMemo(() => parseProgram(params.items).slice(0, 8), [params.items]);
  let current = -1;
  program.forEach((item, i) => {
    if (item.time <= now) current = i;
  });

  return (
    <div className="absolute inset-0 bg-black">
      <div className="absolute inset-x-[80px] top-[50px] flex items-end justify-between border-b-[4px] border-[#F5BB03] pb-4">
        <p className="text-[52px] leading-none font-extrabold tracking-[0.1em] text-[#F5BB03] uppercase">
          {params.title}
        </p>
        <Flap delay={0} text={now} width={5} />
      </div>
      <div className="absolute inset-x-[80px] top-[160px] flex flex-col gap-[14px]">
        {program.map((item, i) => {
          const status =
            i < current ? "FINALIZADO" : i === current ? "EN CURSO" : i === current + 1 ? "PRÓXIMO" : "A TIEMPO";
          return (
            <div key={item.time} className={`flex items-center gap-[30px] ${i < current ? "opacity-40" : ""}`}>
              <Flap delay={i * 120} text={item.time} width={5} />
              <Flap delay={i * 120 + 60} text={item.title} width={22} />
              <span className="ml-auto">
                <Flap
                  delay={i * 120 + 120}
                  text={status}
                  tone={status === "EN CURSO" ? "on" : status === "PRÓXIMO" ? "next" : "default"}
                  width={10}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Networking — speed networking rounds with a prompt each
// ---------------------------------------------------------------------------

export function Networking({ params }: SceneProps<"networking">) {
  const { preview } = useContext(StageContext);
  const prompts = useMemo(() => splitList(params.prompts), [params.prompts]);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useStageFrame((t) => {
    if (preview) return;
    if (!startedAt.current) startedAt.current = t;
    const s = Math.floor((t - startedAt.current) / 1000);
    setElapsed((v) => (v === s ? v : s));
  });
  const per = params.minutes * 60;
  const round = Math.floor(elapsed / per);
  const left = per - (elapsed % per);
  const switching = left > per - 6;
  const prompt = prompts[round % Math.max(1, prompts.length)] ?? "";

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.minutes} min por ronda`} title={params.title} />
      <div className="absolute top-[320px] left-[340px] w-[820px]">
        <AnimatePresence mode="wait">
          {switching && round > 0 ? (
            <m.p
              key="switch"
              animate={{ opacity: 1, scale: 1 }}
              className="text-[110px] leading-[1] font-extrabold text-[#F5BB03] uppercase"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, scale: 0.9 }}
            >
              🔔 ¡Cambio de pareja!
            </m.p>
          ) : (
            <m.div key={round} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} initial={{ opacity: 0, y: 20 }}>
              <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">
                Ronda {round + 1} · preguntale
              </p>
              <p className="mt-4 text-[64px] leading-[1.1] font-extrabold text-balance">{prompt}</p>
            </m.div>
          )}
        </AnimatePresence>
        <p
          className={`countdown-font mt-8 text-[240px] leading-none tracking-wider ${left <= 30 ? "animate-timer-pulse text-[#F5BB03]" : "text-[#FBF5E7]"}`}
        >
          {formatTime(left)}
        </p>
      </div>
      <div className="absolute top-[340px] right-[140px] w-[480px] bg-[#FBF5E7]/[0.07] px-8 py-7 text-[30px] leading-[1.35] text-[#FBF5E7]/80">
        <p className="text-[24px] font-bold tracking-[0.25em] text-[#F5BB03] uppercase">Cómo funciona</p>
        <p className="mt-3">1. Buscá a alguien que no conozcas.</p>
        <p>2. Usen la pregunta de la pantalla.</p>
        <p>3. Cuando suene la campana, cambien.</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Icebreaker — a question for the room, rotating
// ---------------------------------------------------------------------------

export function Icebreaker({ params }: SceneProps<"icebreaker">) {
  const { preview } = useContext(StageContext);
  const questions = useMemo(() => splitList(params.questions), [params.questions]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (preview || questions.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % questions.length), params.seconds * 1000);
    return () => clearInterval(id);
  }, [params.seconds, preview, questions.length]);
  const question = questions[index % Math.max(1, questions.length)] ?? "";

  return (
    <>
      <Ambient />
      <Header eyebrow={params.title} title="Para romper el hielo" />
      <div className="absolute top-[360px] right-[140px] left-[340px]">
        <AnimatePresence mode="wait">
          <m.p
            key={`${index}-${question}`}
            animate={{ opacity: 1, y: 0 }}
            className="text-[96px] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance"
            exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
            initial={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            {question}
          </m.p>
        </AnimatePresence>
        <p className="mt-10 text-[36px] font-semibold text-[#FBF5E7]/60">{params.subtitle}</p>
      </div>
    </>
  );
}
