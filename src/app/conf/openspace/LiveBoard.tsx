"use client";

import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";

import { useCountdownState } from "hooks/useCountdownState";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import type { NowNext } from "lib/openspace/now-next";

import Announcements from "./Announcements";
import LiveGrid from "./LiveGrid";
import LiveMap from "./LiveMap";
import ProposalFeed from "./ProposalFeed";
import { buildBoardRooms, trackAt } from "./board";
import { useLiveBoard } from "./use-live-board";

type LiveBoardProps = {
  eventId: string;
  timezone: string;
  rooms: Room[];
  schedules: Schedule[];
  tracks: StickyNote[];
  /** Derived server-side so hydration has something matching to start from. */
  initialNowNext: NowNext<Schedule>;
};

const PHASE_LABEL = {
  before: "Todavía no arrancó",
  running: "Sucediendo ahora",
  break: "Cambio de sala",
  after: "Terminó por hoy",
} as const;

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);

  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function LiveBoard({ eventId, timezone, rooms, schedules, tracks, initialNowNext }: LiveBoardProps) {
  const boardRooms = useMemo(() => buildBoardRooms(rooms), [rooms]);
  const { nowNext, feed, isConnected } = useLiveBoard({ eventId, schedules, timezone, initialNowNext });
  const { state: countdown } = useCountdownState({ eventId, enableRealtime: true });

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Default the map to the first room that actually has something on.
  useEffect(() => {
    if (selectedRoomId && boardRooms.some((room) => room.id === selectedRoomId)) return;

    const busy = boardRooms.find((room) => trackAt(tracks, room.id, nowNext.current?.id));
    setSelectedRoomId((busy ?? boardRooms[0])?.id ?? null);
  }, [boardRooms, tracks, nowNext.current?.id, selectedRoomId]);

  const activeBlock = nowNext.current ?? nowNext.next ?? null;

  const nowTracks = useMemo(
    () =>
      nowNext.current
        ? boardRooms
            .map((room) => ({ room, track: trackAt(tracks, room.id, nowNext.current!.id) }))
            .filter((entry): entry is { room: (typeof boardRooms)[number]; track: StickyNote } => Boolean(entry.track))
        : [],
    [boardRooms, tracks, nowNext.current]
  );

  const nextTracks = useMemo(
    () =>
      nowNext.next
        ? boardRooms
            .map((room) => ({ room, track: trackAt(tracks, room.id, nowNext.next!.id) }))
            .filter((entry): entry is { room: (typeof boardRooms)[number]; track: StickyNote } => Boolean(entry.track))
        : [],
    [boardRooms, tracks, nowNext.next]
  );

  /* Staff's countdown wins when they are running one; otherwise fall back to
     the block's own end time, so the header is never blank mid-session. */
  const seconds = countdown.isRunning ? countdown.remainingSeconds : nowNext.secondsUntilChange;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-24 sm:px-8">
      {/* Live bar */}
      <div className="sticky top-0 z-40 -mx-5 mb-8 border-b border-[#FBF5E7]/12 bg-black/90 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={classNames(
                "h-1.5 w-1.5 rounded-full",
                isConnected ? "animate-pulse bg-[#F5BB03]" : "bg-[#FBF5E7]/30"
              )}
            />
            <span className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/70">
              {isConnected ? PHASE_LABEL[nowNext.phase] : "Reconectando…"}
            </span>
          </span>

          {activeBlock ? (
            <span className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/45">
              {activeBlock.name} · {activeBlock.startTime}–{activeBlock.endTime}
            </span>
          ) : null}

          {seconds !== null ? (
            <span className="ml-auto inline-flex items-baseline gap-2">
              <span className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/45">
                {nowNext.phase === "running" ? "Termina en" : "Arranca en"}
              </span>
              <span className="font-display text-lg font-extrabold leading-none tabular-nums text-[#F5BB03]">
                {formatClock(seconds)}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Ahora */}
        <section aria-label="Sesiones en curso" className="border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]">
          <p className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
            Ahora
          </p>
          {nowTracks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm leading-relaxed text-[#FBF5E7]/45">
              {nowNext.phase === "before"
                ? "El open space todavía no arrancó. La grilla se llena el mismo día."
                : nowNext.phase === "after"
                  ? "Terminaron las sesiones de hoy."
                  : "Nadie está dando charla en este momento. Buen momento para proponer una."}
            </p>
          ) : (
            <ul className="divide-y divide-[#FBF5E7]/10">
              {nowTracks.map(({ room, track }) => (
                <li key={track.id}>
                  <button
                    className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FBF5E7]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45"
                      style={{ backgroundColor: room.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/50">
                        {room.name}
                      </span>
                      <span className="mt-2 block text-pretty text-base font-medium leading-snug text-[#FBF5E7]">
                        {track.title}
                      </span>
                      {track.speaker ? (
                        <span className="mt-1 block truncate text-sm text-[#FBF5E7]/50">{track.speaker}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Próximo, folded into the same card so the page stays short on a phone */}
          {nextTracks.length > 0 ? (
            <div className="border-t border-[#FBF5E7]/12">
              <p className="px-5 pb-2 pt-4 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/40">
                Próximo bloque · {nowNext.next?.startTime}
              </p>
              <ul className="px-5 pb-4">
                {nextTracks.map(({ room, track }) => (
                  <li key={track.id} className="flex items-center gap-2.5 py-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rotate-45"
                      style={{ backgroundColor: room.color }}
                    />
                    <span className="truncate text-sm text-[#FBF5E7]/65">{track.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <LiveMap
          rooms={boardRooms}
          scheduleId={nowNext.current?.id}
          selectedRoomId={selectedRoomId}
          tracks={tracks}
          onSelect={setSelectedRoomId}
        />

        <Announcements eventId={eventId} timezone={timezone} />
        <ProposalFeed entries={feed} rooms={boardRooms} />
      </div>

      <section className="mt-10" id="grilla">
        <h2 className="font-display text-xl font-extrabold uppercase leading-none tracking-[-0.02em] text-[#FBF5E7] sm:text-2xl">
          La grilla completa
        </h2>
        <p className="mb-5 mt-2 text-sm text-[#FBF5E7]/55">
          Todas las salas y todos los bloques. Se actualiza sola cuando alguien cuelga una card.
        </p>
        <LiveGrid
          currentScheduleId={nowNext.current?.id ?? null}
          nextScheduleId={nowNext.next?.id ?? null}
          rooms={boardRooms}
          schedules={schedules}
          tracks={tracks}
        />
      </section>
    </div>
  );
}
