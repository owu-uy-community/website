"use client";

import classNames from "classnames";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";

import { QrCode } from "components/Admin/comms/QrCode";
import { RoomStatusBadge } from "components/Meetups/OpenSpace/atoms/RoomStatusBadge";
import { useCountdownState } from "hooks/useCountdownState";
import { useFullscreen } from "hooks/useFullscreen";
import { useMounted } from "hooks/useMounted";
import { useOpenSpaceNotesORPC } from "hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "hooks/useOpenSpaceSetup";
import { useWakeLock } from "hooks/useWakeLock";
import { INTERNAL_ROUTES } from "app/lib/constants";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import { resolveNowNext } from "lib/openspace/now-next";
import { matchTrack, tagsOf, type TrackTags } from "lib/openspace/topics";

import { TALKS } from "../talks";
import Announcements from "./Announcements";
import ForYou from "./ForYou";
import InterestSurvey from "./InterestSurvey";
import LiveGrid from "./LiveGrid";
import LiveMap from "./LiveMap";
import PersonaliseCard from "./PersonaliseCard";
import ProposalFeed from "./ProposalFeed";
import { buildBoardRooms, trackAt, type BoardRoom } from "./board";
import { dayState } from "./phase";
import type { Selection } from "./selection";
import { useInterests } from "./use-interests";

type LiveBoardProps = {
  eventId: string;
  timezone: string;
  /** The server's clock when it rendered (ms): the first client render starts there, so hydration matches. */
  at: number;
  initialRooms: Room[];
  initialSchedules: Schedule[];
  initialNotes: StickyNote[];
  /** The board's public address, for the QR on a venue screen. */
  shareUrl: string;
};

/** In a block's last five minutes the question is «¿y después?»: Próximo goes first. */
const LAST_MINUTES_S = 5 * 60;
/** Rooms and slots also refetch on a slow timer: a phone that slept may have missed a ping. */
const REFETCH_MS = 60_000;

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const [hours, minutes, rest] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const mmss = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;

  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

const label = "font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase";
const panel = "border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]";

/**
 * conf.owu.uy/openspace on the day. The server hands over a snapshot; from then on the kiosk's
 * own hooks keep it current (card changes apply as they arrive, room and slot changes refetch),
 * and the clock runs here, so the countdowns keep going if the socket drops.
 *
 * What leads changes with the afternoon (phase.ts): the countdown to the mercado, the grid
 * filling up while it runs, «what's on now and where» during the sessions, the full grid after.
 */
export default function LiveBoard({
  eventId,
  timezone,
  at,
  initialRooms,
  initialSchedules,
  initialNotes,
  shareUrl,
}: LiveBoardProps) {
  const { roomsData, schedulesData } = useOpenSpaceSetup(eventId, {
    initialRooms,
    initialSchedules,
    refetchInterval: REFETCH_MS,
    hideInactiveRooms: true,
  });
  const { notes, isConnected, recentlyUpdatedIds } = useOpenSpaceNotesORPC({
    openSpaceId: eventId,
    initialData: initialNotes,
    refetchInterval: REFETCH_MS,
  });
  const { state: countdown } = useCountdownState({ eventId, enableRealtime: true });
  const { interests, ready, save, clear } = useInterests();
  const mounted = useMounted();

  const [now, setNow] = useState(at);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1_000);

    return () => clearInterval(interval);
  }, []);

  /* When the board last changed, for an honest «datos de HH:MM» while the socket is down */
  const [lastSync, setLastSync] = useState(at);
  useEffect(() => setLastSync(Date.now()), [notes, roomsData, schedulesData]);

  const rooms = useMemo(() => buildBoardRooms(roomsData), [roomsData]);
  const blocks = useMemo(() => schedulesData.filter((schedule) => schedule.isActive), [schedulesData]);
  const nowNext = useMemo(() => resolveNowNext(blocks, timezone, new Date(now)), [blocks, timezone, now]);
  const day = useMemo(() => dayState(blocks, timezone, new Date(now)), [blocks, timezone, now]);
  const tags = useMemo<Record<string, TrackTags>>(
    () => Object.fromEntries(notes.map((note) => [note.id, tagsOf(note)])),
    [notes]
  );
  const matches = useMemo(
    () =>
      new Set(
        interests
          ? notes
              .filter((note) => matchTrack(tags[note.id], interests.topics, interests.goal).score > 0)
              .map((note) => note.id)
          : []
      ),
    [interests, notes, tags]
  );

  const [selected, setSelected] = useState<Selection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLElement>(null);
  const {
    ref: screenRef,
    isFullscreen: screen,
    supported: screenSupported,
    toggle: toggleScreen,
  } = useFullscreen<HTMLDivElement>();
  useWakeLock(screen);

  /** The block the page is oriented around: the one on now, else the next. */
  const activeBlock = nowNext.current ?? nowNext.next;
  /* The map follows the selection: a later cell picked in the grid moves the whole map to that block. */
  const mapBlock = useMemo(
    () => blocks.find((block) => block.id === selected?.scheduleId) ?? activeBlock,
    [blocks, selected?.scheduleId, activeBlock]
  );

  // Start on the first room with something on in the active block
  useEffect(() => {
    if (!activeBlock) return;
    if (selected && rooms.some((room) => room.id === selected.roomId)) return;
    const room = rooms.find((candidate) => trackAt(notes, candidate.id, activeBlock.id)) ?? rooms[0];
    if (room) setSelected({ roomId: room.id, scheduleId: activeBlock.id });
  }, [rooms, notes, activeBlock, selected]);

  /* On a phone the answer to «where is that» is the reason for the tap, so the map comes into
     view; on a desktop it already sits beside the list. */
  const selectAndShow = useCallback((next: Selection) => {
    setSelected(next);
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const byBlock = useCallback(
    (block: Schedule | null) =>
      block
        ? rooms
            .map((room) => ({ room, track: trackAt(notes, room.id, block.id) }))
            .filter((entry): entry is { room: BoardRoom; track: StickyNote } => entry.track !== null)
        : [],
    [rooms, notes]
  );

  const evacuating = rooms.filter((room) => room.status === "evacuate");
  const cells = rooms.length * blocks.length;
  const booked = notes.filter((note) => rooms.some((room) => room.id === note.roomId)).length;

  const bar = (() => {
    switch (day.phase) {
      case "arrival":
        return { text: "Hoy se arma la grilla", until: "El mercado arranca en", seconds: day.secondsToMercado };
      case "mercado":
        return { text: "Mercado de ideas", until: "Las sesiones arrancan en", seconds: day.secondsToFirstBlock };
      case "sesiones":
        return nowNext.current
          ? {
              text: `Sesiones · ${nowNext.current.startTime}–${nowNext.current.endTime}`,
              until: "Termina en",
              // The staff's countdown wins while they run one; otherwise the block's own end
              seconds: countdown.isRunning ? countdown.remainingSeconds : nowNext.secondsUntilChange,
            }
          : { text: "Cambio de sala", until: "Arranca en", seconds: nowNext.secondsUntilChange };
      default:
        return { text: "Terminó el open space", until: null, seconds: null };
    }
  })();

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }),
    [timezone]
  );
  const canPersonalise = ready && day.phase !== "after";

  return (
    <div
      ref={screenRef}
      className="group/board bg-black data-[screen=true]:overflow-auto data-[screen=true]:px-8 data-[screen=true]:pb-10"
      data-screen={screen}
    >
      {/* Live bar: the one thing that must be true at a glance, under the navbar */}
      <div className="sticky top-16 z-40 border-b border-[#FBF5E7]/12 bg-black/95 backdrop-blur group-data-[screen=true]/board:top-0 sm:top-20">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-x-4 px-4 py-3 sm:px-8">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={classNames(
                "h-2 w-2 shrink-0 rounded-full",
                mounted && isConnected ? "animate-pulse bg-[#F5BB03]" : "bg-[#FBF5E7]/40"
              )}
            />
            <span className="truncate font-display text-xs leading-none font-bold tracking-[0.12em] text-[#FBF5E7]/85 uppercase">
              {bar.text}
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-baseline gap-2">
            {bar.seconds !== null && bar.until ? (
              <>
                <span className="hidden font-display text-[11px] leading-none font-bold tracking-[0.12em] text-[#FBF5E7]/70 uppercase min-[420px]:inline">
                  {bar.until}
                </span>
                <span
                  className="font-display text-xl leading-none font-extrabold text-[#F5BB03] tabular-nums"
                  suppressHydrationWarning
                >
                  {clock(bar.seconds)}
                </span>
              </>
            ) : null}
          </span>
        </div>
        {/* Honest about staleness: live only while the socket is up */}
        {mounted && !isConnected ? (
          <p className="border-t border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.04] px-4 py-1.5 text-center text-xs text-[#FBF5E7]/80 sm:px-8">
            Sin conexión · datos de las {time.format(new Date(lastSync))}. Los relojes siguen andando.
          </p>
        ) : null}
        {evacuating.length > 0 ? (
          <p
            className="bg-[#CD363C] px-4 py-3 text-center font-display text-sm font-extrabold tracking-[0.04em] text-white uppercase sm:px-8"
            role="alert"
          >
            Evacuar {evacuating.map((room) => room.name).join(", ")}: seguí las indicaciones del staff
          </p>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-4 pt-6 pb-24 sm:px-8">
        <div className="flex flex-col gap-6 sm:gap-8">
          <div className="grid gap-6 xl:grid-cols-12 xl:gap-8">
            <div className="flex flex-col gap-6 xl:col-span-5">
              <section ref={nowRef} aria-label="Ahora en el open space" className={classNames(panel, "scroll-mt-36")}>
                {day.phase === "arrival" ? (
                  <Arrival secondsToMercado={day.secondsToMercado} />
                ) : day.phase === "mercado" ? (
                  <Mercado booked={booked} cells={cells} secondsToFirstBlock={day.secondsToFirstBlock} />
                ) : day.phase === "after" ? (
                  <After />
                ) : (
                  <NowAndNext
                    current={nowNext.current}
                    next={nowNext.next}
                    lastMinutes={nowNext.current !== null && (nowNext.secondsUntilChange ?? Infinity) < LAST_MINUTES_S}
                    matches={matches}
                    nowTracks={byBlock(nowNext.current)}
                    nextTracks={byBlock(nowNext.next)}
                    selected={selected}
                    onSelect={selectAndShow}
                  />
                )}
              </section>

              {day.phase === "mercado" ? <ProposalFeed now={now} rooms={rooms} tracks={notes} /> : null}

              {canPersonalise ? (
                <div className="group-data-[screen=true]/board:hidden">
                  {interests && notes.length > 0 ? (
                    <ForYou
                      current={nowNext.current}
                      interests={interests}
                      next={nowNext.next}
                      rooms={rooms}
                      tags={tags}
                      tracks={notes}
                      onEdit={() => setSurveyOpen(true)}
                      onSelect={selectAndShow}
                    />
                  ) : (
                    <PersonaliseCard answered={interests !== null} onOpen={() => setSurveyOpen(true)} />
                  )}
                </div>
              ) : null}

              <Announcements eventId={eventId} timezone={timezone} />
            </div>

            <div className="xl:col-span-7">
              <div className="xl:sticky xl:top-36">
                <LiveMap
                  ref={mapRef}
                  block={mapBlock}
                  hoveredRoomId={hovered}
                  rooms={rooms}
                  selected={selected}
                  tracks={notes}
                  onSelect={setSelected}
                  onShowOthers={() => nowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                />
              </div>
            </div>
          </div>

          {/* While the mercado runs and after it's over, the grid itself is the story */}
          <section
            aria-labelledby="grilla-title"
            className={classNames(
              "scroll-mt-36 group-data-[screen=true]/board:-order-1",
              (day.phase === "mercado" || day.phase === "after") && "-order-1"
            )}
            id="grilla"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2
                  className="font-display text-xl leading-none font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase sm:text-2xl"
                  id="grilla-title"
                >
                  {day.phase === "after" ? "Así quedó la grilla" : "La grilla completa"}
                </h2>
                <p className="mt-2 text-sm text-[#FBF5E7]/70">
                  {day.phase === "after"
                    ? `${booked} charlas propuestas por la sala, en ${rooms.length} espacios.`
                    : "Es la misma grilla de las pantallas del venue: se actualiza sola cuando alguien cuelga una card."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* A venue screen: people walking by take the board with them */}
                <div className="mr-4 hidden items-center gap-3 group-data-[screen=true]/board:flex">
                  <QrCode className="shrink-0" size={88} title="La grilla en tu celular" value={shareUrl} />
                  <p className="font-display text-base leading-tight font-extrabold text-[#FBF5E7] uppercase">
                    La grilla en tu celular
                    <span className="mt-1 block text-sm font-bold text-[#F5BB03] normal-case">
                      {shareUrl.replace(/^https?:\/\//, "")}
                    </span>
                  </p>
                </div>
                {nowNext.current ? (
                  <button
                    className="inline-flex min-h-10 items-center border border-[#FBF5E7]/25 px-3 text-xs font-semibold text-[#FBF5E7] transition-colors hover:border-[#F5BB03] hover:text-[#F5BB03] md:hidden"
                    type="button"
                    onClick={() => {
                      const block = document.querySelector<HTMLDetailsElement>(
                        `details[data-block="${nowNext.current?.id}"]`
                      );
                      if (!block) return;
                      block.open = true;
                      block.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Ir a ahora
                  </button>
                ) : null}
                {screenSupported ? (
                  <button
                    className="hidden min-h-10 items-center gap-2 border border-[#FBF5E7]/25 px-3 text-xs font-semibold text-[#FBF5E7] transition-colors hover:border-[#F5BB03] hover:text-[#F5BB03] lg:inline-flex"
                    title="Para una pantalla o un proyector en el venue (Esc para salir)"
                    type="button"
                    onClick={() => void toggleScreen()}
                  >
                    {screen ? (
                      <Minimize2 aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {screen ? "Salir del modo pantalla" : "Modo pantalla"}
                  </button>
                ) : null}
              </div>
            </div>
            <LiveGrid
              currentScheduleId={nowNext.current?.id ?? null}
              matches={matches}
              nextScheduleId={nowNext.next?.id ?? null}
              now={now}
              pulsing={recentlyUpdatedIds}
              rooms={rooms}
              schedules={blocks}
              selected={selected}
              tracks={notes}
              onHover={setHovered}
              onSelect={selectAndShow}
            />
            {interests ? (
              <button
                className="mt-2 inline-flex min-h-11 items-center text-xs text-[#FBF5E7]/70 underline underline-offset-4 transition-colors group-data-[screen=true]/board:hidden hover:text-[#FBF5E7]"
                type="button"
                onClick={clear}
              >
                Olvidar mis intereses en este dispositivo
              </button>
            ) : null}
          </section>

          {day.phase !== "mercado" ? <ProposalFeed now={now} rooms={rooms} tracks={notes} /> : null}
        </div>
      </div>

      <InterestSurvey
        initial={interests}
        open={surveyOpen}
        onClose={() => setSurveyOpen(false)}
        onSave={(next) => {
          save(next);
          setSurveyOpen(false);
        }}
      />
    </div>
  );
}

function Arrival({ secondsToMercado }: { secondsToMercado: number | null }) {
  return (
    <div className="px-5 py-6 sm:px-6">
      <p className={label}>Hoy se arma la grilla</p>
      {secondsToMercado !== null ? (
        <p className="mt-4">
          <span className="block text-sm text-[#FBF5E7]/75">El mercado de ideas arranca en</span>
          <span
            className="mt-1 block font-display text-5xl leading-none font-extrabold text-[#F5BB03] tabular-nums"
            suppressHydrationWarning
          >
            {clock(secondsToMercado)}
          </span>
        </p>
      ) : null}
      <ul className="mt-6 grid gap-4 border-t border-[#FBF5E7]/12 pt-5 text-sm leading-relaxed text-[#FBF5E7]/85">
        <li>
          <strong className="font-semibold text-[#FBF5E7]">¿Querés proponer?</strong> Pensá un título que entre en una
          card: vas a tener treinta segundos de micrófono para contarlo.
        </li>
        <li>
          <strong className="font-semibold text-[#FBF5E7]">¿Solo querés participar?</strong> No tenés que hacer nada.
          Cuando arranquen las sesiones, esta página te dice qué hay en cada sala.
        </li>
      </ul>
      <Link
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-[#FBF5E7] underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03]"
        href={`${INTERNAL_ROUTES.conf.current}#open-space`}
      >
        Cómo funciona un open space <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function Mercado({
  booked,
  cells,
  secondsToFirstBlock,
}: {
  booked: number;
  cells: number;
  secondsToFirstBlock: number | null;
}) {
  return (
    <div className="px-5 py-6 sm:px-6">
      <p className={label}>Mercado de ideas</p>
      <p className="mt-3 font-display text-2xl leading-tight font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase sm:text-3xl">
        Se está armando la grilla
      </p>
      <dl className="mt-5 grid grid-cols-3 gap-px border border-[#FBF5E7]/12 bg-[#FBF5E7]/12">
        {[
          { term: "propuestas", value: String(booked) },
          { term: "lugares libres", value: String(Math.max(0, cells - booked)) },
          { term: "para arrancar", value: secondsToFirstBlock === null ? "—" : clock(secondsToFirstBlock) },
        ].map(({ term, value }) => (
          <div key={term} className="flex flex-col-reverse bg-black px-3 py-3">
            <dt className="mt-1 text-xs text-[#FBF5E7]/70">{term}</dt>
            <dd
              className="font-display text-2xl leading-none font-extrabold text-[#F5BB03] tabular-nums"
              suppressHydrationWarning
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-[#FBF5E7]/80">
        Cada card que se cuelga aparece acá al instante. Si todavía no propusiste y tenés un tema, hay lugar.
      </p>
    </div>
  );
}

function After() {
  return (
    <div className="px-5 py-6 sm:px-6">
      <p className={label}>Terminó el open space</p>
      <p className="mt-3 font-display text-2xl leading-tight font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
        Gracias por armar la tarde
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[#FBF5E7]/80">
        Ahora, coffee break: la charla sigue en el pasillo. A las {TALKS[0].start} arrancan las charlas.
      </p>
      <Link
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-[#FBF5E7] underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03]"
        href={`${INTERNAL_ROUTES.conf.current}#programa`}
      >
        El programa de la tarde <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function NowAndNext({
  current,
  next,
  lastMinutes,
  nowTracks,
  nextTracks,
  matches,
  selected,
  onSelect,
}: {
  current: Schedule | null;
  next: Schedule | null;
  /** The block is almost over: Próximo leads. */
  lastMinutes: boolean;
  nowTracks: { room: BoardRoom; track: StickyNote }[];
  nextTracks: { room: BoardRoom; track: StickyNote }[];
  matches: ReadonlySet<string>;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const nowList = (
    <div>
      <p className={classNames(label, "border-b border-[#FBF5E7]/12 px-5 py-3.5")}>Ahora</p>
      {nowTracks.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm leading-relaxed text-[#FBF5E7]/70">
          {current
            ? "Nadie está dando charla en este bloque. Buen momento para proponer una."
            : "Cambio de sala: el próximo bloque arranca enseguida."}
        </p>
      ) : (
        <ul className="divide-y divide-[#FBF5E7]/10">
          {nowTracks.map(({ room, track }) => {
            const isSelected = selected?.roomId === room.id && selected?.scheduleId === current?.id;

            return (
              <li key={track.id}>
                <button
                  aria-pressed={isSelected}
                  className={classNames(
                    "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]",
                    isSelected ? "bg-[#F5BB03]/[0.1]" : "hover:bg-[#FBF5E7]/[0.04]"
                  )}
                  type="button"
                  onClick={() => current && onSelect({ roomId: room.id, scheduleId: current.id })}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45"
                    style={{ backgroundColor: room.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[11px] leading-none font-bold tracking-[0.14em] text-[#FBF5E7]/75 uppercase">
                        {room.name}
                      </span>
                      <RoomStatusBadge status={room.status} />
                      {matches.has(track.id) ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#F5BB03]">
                          <Sparkles aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
                          Para vos
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-base leading-snug font-medium text-pretty text-[#FBF5E7]">
                      {track.title}
                    </span>
                    {track.speaker ? (
                      <span className="mt-1 block truncate text-sm text-[#FBF5E7]/70">{track.speaker}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const nextList =
    next && nextTracks.length > 0 ? (
      <div className={lastMinutes ? undefined : "border-t border-[#FBF5E7]/12"}>
        <p className={classNames(label, "px-5 pt-4 pb-2", lastMinutes && "text-[#F5BB03]")}>
          Próximo · {next.startTime}
        </p>
        <ul className="px-2 pb-3">
          {nextTracks.map(({ room, track }) => (
            <li key={track.id}>
              <button
                className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-[#FBF5E7]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                type="button"
                onClick={() => onSelect({ roomId: room.id, scheduleId: next.id })}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rotate-45"
                  style={{ backgroundColor: room.color }}
                />
                <span className="w-20 shrink-0 truncate font-display text-[10px] font-bold tracking-[0.12em] text-[#FBF5E7]/70 uppercase">
                  {room.name}
                </span>
                <span className="truncate text-sm text-[#FBF5E7]/85">{track.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return lastMinutes ? (
    <>
      {nextList}
      <div className="border-t border-[#FBF5E7]/12">{nowList}</div>
    </>
  ) : (
    <>
      {nowList}
      {nextList}
    </>
  );
}
