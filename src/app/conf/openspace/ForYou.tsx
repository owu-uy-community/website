"use client";

import classNames from "classnames";
import { useMemo } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";

import type { Schedule, StickyNote } from "lib/orpc";
import { formatLabel, matchTrack, topicLabel, type TrackTags } from "lib/openspace/topics";

import type { BoardRoom } from "./board";
import { trackAt } from "./board";
import type { Interests } from "./use-interests";

type ForYouProps = {
  rooms: BoardRoom[];
  tracks: StickyNote[];
  tags: Record<string, TrackTags>;
  current: Schedule | null;
  next: Schedule | null;
  interests: Interests;
  onSelect: (selection: { roomId: string; scheduleId: string }) => void;
  onEdit: () => void;
  className?: string;
};

const MAX_SUGGESTIONS = 4;

/**
 * The board reordered by what this visitor said they came for. Only the block
 * running now and the one after it: on event day the question is always "where
 * do I walk in the next few minutes", never "what is on at 5pm".
 */
export default function ForYou({
  rooms,
  tracks,
  tags,
  current,
  next,
  interests,
  onSelect,
  onEdit,
  className,
}: ForYouProps) {
  const suggestions = useMemo(() => {
    const blocks = [current, next].filter((block): block is Schedule => Boolean(block));

    return blocks
      .flatMap((block) =>
        rooms.flatMap((room) => {
          const track = trackAt(tracks, room.id, block.id);
          if (!track) return [];

          const match = matchTrack(tags[track.id], interests.topics, interests.goal);
          if (match.score === 0) return [];

          return [{ block, room, track, match, isNow: block.id === current?.id }];
        })
      )
      .sort((a, b) => b.match.score - a.match.score || Number(b.isNow) - Number(a.isNow))
      .slice(0, MAX_SUGGESTIONS);
  }, [rooms, tracks, tags, current, next, interests]);

  return (
    <section
      aria-labelledby="for-you-title"
      className={classNames("border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#FBF5E7]/12 px-5 py-3">
        <p
          className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60"
          id="for-you-title"
        >
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#F5BB03]" strokeWidth={2.2} />
          Para vos
        </p>
        <button
          className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-[#FBF5E7]/60 transition-colors hover:text-[#FBF5E7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]"
          type="button"
          onClick={onEdit}
        >
          <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
          Ajustar
        </button>
      </div>

      {suggestions.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm leading-relaxed text-[#FBF5E7]/50">
          Nada en los próximos dos bloques coincide con tus temas. Mirá la grilla completa — o proponé vos la charla que
          falta.
        </p>
      ) : (
        <ul className="divide-y divide-[#FBF5E7]/10">
          {suggestions.map(({ block, room, track, match, isNow }) => (
            <li key={`${block.id}-${track.id}`}>
              <button
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FBF5E7]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                type="button"
                onClick={() => onSelect({ roomId: room.id, scheduleId: block.id })}
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45"
                  style={{ backgroundColor: room.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-display text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/55">
                      {room.name}
                    </span>
                    <span
                      className={
                        isNow
                          ? "font-display text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-[#F5BB03]"
                          : "font-display text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/40"
                      }
                    >
                      {isNow ? "Ahora" : `${block.startTime}`}
                    </span>
                  </span>
                  <span className="mt-2 block text-pretty text-base font-medium leading-snug text-[#FBF5E7]">
                    {track.title}
                  </span>
                  {/* Why it is here — a ranking nobody can see the reason for is just noise. */}
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {match.matched.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-[#F5BB03]/15 px-2 py-0.5 text-[11px] leading-[18px] text-[#F5BB03]"
                      >
                        {topicLabel(topic)}
                      </span>
                    ))}
                    {match.suitsGoal && tags[track.id]?.format ? (
                      <span className="rounded-full bg-[#FBF5E7]/10 px-2 py-0.5 text-[11px] leading-[18px] text-[#FBF5E7]/70">
                        {formatLabel(tags[track.id].format!)}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
