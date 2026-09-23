"use client";

import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCountdownState } from "hooks/useCountdownState";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import type { NowNext } from "lib/openspace/now-next";
import type { TrackTags } from "lib/openspace/topics";

import Announcements from "./Announcements";
import ForYou from "./ForYou";
import InterestSurvey from "./InterestSurvey";
import LiveGrid from "./LiveGrid";
import LiveMap from "./LiveMap";
import ProposalFeed from "./ProposalFeed";
import { buildBoardRooms, trackAt } from "./board";
import type { Selection } from "./selection";
import { useInterests } from "./use-interests";
import { useLiveBoard } from "./use-live-board";

type LiveBoardProps = {
  eventId: string;
  timezone: string;
  rooms: Room[];
  schedules: Schedule[];
  tracks: StickyNote[];
  /** Derived server-side so hydration has something matching to start from. */
  initialNowNext: NowNext<Schedule>;
  /** Topic/format tags per track id, for the "Para vos" ranking. */
  tags: Record<string, TrackTags>;
};

const PHASE_LABEL = {
  before: "Todavía no arrancó",
  running: "Sucediendo ahora",
  break: "Cambio de sala",
  after: "Terminó por hoy",
} as const;

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);

  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function LiveBoard({
  eventId,
  timezone,
  rooms,
  schedules,
  tracks,
  initialNowNext,
  tags,
}: LiveBoardProps) {
  const boardRooms = useMemo(() => buildBoardRooms(rooms), [rooms]);
  const { nowNext, feed, isConnected, clock } = useLiveBoard({ eventId, schedules, timezone, initialNowNext });
  const { state: countdown } = useCountdownState({ eventId, enableRealtime: true });
  const { interests, ready, save, clear } = useInterests();

  const [selected, setSelected] = useState<Selection | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyDismissed, setSurveyDismissed] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  /** The block the page is oriented around: what is on now, else what is next. */
  const activeBlock = nowNext.current ?? nowNext.next ?? null;

  /* The map follows the selection. Picking a later cell in the grid should move
     the whole map to that block, header included — otherwise the times on it
     contradict the talks under them. */
  const mapBlock = useMemo(
    () => schedules.find((schedule) => schedule.id === selected?.scheduleId) ?? activeBlock,
    [schedules, selected?.scheduleId, activeBlock]
  );

  // Default the selection to the first room that actually has something on.
  useEffect(() => {
    if (!activeBlock) return;
    if (selected && boardRooms.some((room) => room.id === selected.roomId)) return;

    const busy = boardRooms.find((room) => trackAt(tracks, room.id, activeBlock.id));
    const room = busy ?? boardRooms[0];
    if (room) setSelected({ roomId: room.id, scheduleId: activeBlock.id });
  }, [boardRooms, tracks, activeBlock, selected]);

  /* Picking from a list scrolls the map into view — on a phone the answer to
     "where is that" is the whole reason for the tap. */
  const selectAndShowMap = useCallback((next: Selection) => {
    setSelected(next);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const byBlock = useCallback(
    (block: Schedule | null) =>
      block
        ? boardRooms
            .map((room) => ({ room, track: trackAt(tracks, room.id, block.id) }))
            .filter((entry): entry is { room: (typeof boardRooms)[number]; track: StickyNote } => Boolean(entry.track))
        : [],
    [boardRooms, tracks]
  );

  const nowTracks = useMemo(() => byBlock(nowNext.current), [byBlock, nowNext.current]);
  const nextTracks = useMemo(() => byBlock(nowNext.next), [byBlock, nowNext.next]);

  /* Staff's countdown wins when they are running one; otherwise fall back to
     the block's own end time, so the header is never blank mid-session. */
  const seconds = countdown.isRunning ? countdown.remainingSeconds : nowNext.secondsUntilChange;

  const showSurvey = ready && !interests && !surveyDismissed && tracks.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 sm:px-8">
      {/* Live bar — the one thing that must be true at a glance, always on screen */}
      <div className="sticky top-0 z-40 -mx-4 mb-6 border-b border-[#FBF5E7]/12 bg-black/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={classNames(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                isConnected ? "animate-pulse bg-[#F5BB03]" : "bg-[#FBF5E7]/30"
              )}
            />
            <span className="truncate font-display text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#FBF5E7]/70">
              {isConnected ? PHASE_LABEL[nowNext.phase] : "Reconectando…"}
            </span>
          </span>

          {activeBlock ? (
            <span className="hidden shrink-0 font-display text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#FBF5E7]/45 sm:inline">
              {activeBlock.name} · {activeBlock.startTime}–{activeBlock.endTime}
            </span>
          ) : null}

          <span className="ml-auto flex shrink-0 items-baseline gap-3">
            {seconds !== null ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-display text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-[#FBF5E7]/45">
                  {nowNext.phase === "running" ? "Termina en" : "Arranca en"}
                </span>
                <span className="font-display text-lg font-extrabold leading-none tabular-nums text-[#F5BB03]">
                  {formatClock(seconds)}
                </span>
              </span>
            ) : null}
            {/* Absolute time with seconds: proof the page is live, not cached */}
            <span
              aria-label="Hora actual"
              className="hidden text-xs tabular-nums text-[#FBF5E7]/40 min-[420px]:inline"
            >
              {clock ?? "--:--:--"}
            </span>
          </span>
        </div>
      </div>

      {/*
       * Order is deliberate and differs by screen. On a phone the map comes
       * first — the question in the hallway is "where do I go" — while on a
       * desktop the two sit side by side and reading order puts the list first.
       */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:gap-8">
        <LiveMap
          ref={mapRef}
          block={mapBlock}
          className="lg:order-2"
          rooms={boardRooms}
          selected={selected}
          tracks={tracks}
          onSelect={setSelected}
        />

        <section
          aria-label="Sesiones en curso"
          className="border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02] lg:order-1"
        >
          <p className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
            Ahora
          </p>
          {nowTracks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm leading-relaxed text-[#FBF5E7]/50">
              {nowNext.phase === "before"
                ? "El open space todavía no arrancó. La grilla se llena el mismo día."
                : nowNext.phase === "after"
                  ? "Terminaron las sesiones de hoy."
                  : "Nadie está dando charla en este momento. Buen momento para proponer una."}
            </p>
          ) : (
            <ul className="divide-y divide-[#FBF5E7]/10">
              {nowTracks.map(({ room, track }) => {
                const isSelected = selected?.roomId === room.id && selected?.scheduleId === nowNext.current?.id;

                return (
                  <li key={track.id}>
                    <button
                      aria-pressed={isSelected}
                      className={classNames(
                        "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]",
                        isSelected ? "bg-[#F5BB03]/[0.1]" : "hover:bg-[#FBF5E7]/[0.04]"
                      )}
                      type="button"
                      onClick={() =>
                        nowNext.current && selectAndShowMap({ roomId: room.id, scheduleId: nowNext.current.id })
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45"
                        style={{ backgroundColor: room.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/55">
                          {room.name}
                        </span>
                        <span className="mt-2 block text-pretty text-base font-medium leading-snug text-[#FBF5E7]">
                          {track.title}
                        </span>
                        {track.speaker ? (
                          <span className="mt-1 block truncate text-sm text-[#FBF5E7]/55">{track.speaker}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Próximo, folded into the same card so the page stays short on a phone */}
          {nextTracks.length > 0 ? (
            <div className="border-t border-[#FBF5E7]/12">
              <p className="px-5 pb-2 pt-4 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/45">
                Próximo bloque · {nowNext.next?.startTime}
              </p>
              <ul className="px-2 pb-3">
                {nextTracks.map(({ room, track }) => (
                  <li key={track.id}>
                    <button
                      className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-[#FBF5E7]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                      type="button"
                      onClick={() =>
                        nowNext.next && selectAndShowMap({ roomId: room.id, scheduleId: nowNext.next.id })
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rotate-45"
                        style={{ backgroundColor: room.color }}
                      />
                      <span className="truncate text-sm text-[#FBF5E7]/70">{track.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {showSurvey ? (
          <div className="lg:order-3 lg:col-span-2">
            <InterestSurvey onDismiss={() => setSurveyDismissed(true)} onSave={save} />
          </div>
        ) : null}

        {interests ? (
          surveyOpen ? (
            <div className="lg:order-3 lg:col-span-2">
              <InterestSurvey
                onDismiss={() => setSurveyOpen(false)}
                onSave={(next) => {
                  save(next);
                  setSurveyOpen(false);
                }}
              />
            </div>
          ) : (
            <ForYou
              className="lg:order-3"
              current={nowNext.current}
              interests={interests}
              next={nowNext.next}
              onEdit={() => setSurveyOpen(true)}
              onSelect={selectAndShowMap}
              rooms={boardRooms}
              tags={tags}
              tracks={tracks}
            />
          )
        ) : null}

        <Announcements className="lg:order-4" eventId={eventId} timezone={timezone} />
        <ProposalFeed className="lg:order-5" entries={feed} rooms={boardRooms} />
      </div>

      <section className="mt-8 sm:mt-10" id="grilla">
        <h2 className="font-display text-xl font-extrabold uppercase leading-none tracking-[-0.02em] text-[#FBF5E7] sm:text-2xl">
          La grilla completa
        </h2>
        <p className="mb-4 mt-2 text-sm text-[#FBF5E7]/60">
          Tocá cualquier charla para verla en el mapa. Se actualiza sola cuando alguien cuelga una card.
        </p>
        <LiveGrid
          currentScheduleId={nowNext.current?.id ?? null}
          nextScheduleId={nowNext.next?.id ?? null}
          onSelect={selectAndShowMap}
          rooms={boardRooms}
          schedules={schedules}
          selected={selected}
          tracks={tracks}
        />

        {interests ? (
          <button
            className="mt-2 inline-flex min-h-11 items-center text-xs text-[#FBF5E7]/60 underline underline-offset-4 transition-colors hover:text-[#FBF5E7]"
            type="button"
            onClick={clear}
          >
            Olvidar mis intereses en este teléfono
          </button>
        ) : null}
      </section>
    </div>
  );
}
