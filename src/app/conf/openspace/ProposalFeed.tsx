"use client";

import classNames from "classnames";
import { useMemo } from "react";

import type { StickyNote } from "lib/orpc";

import type { BoardRoom } from "./board";

const SHOWN = 5;
/** «Recién»: what landed on the board in the last quarter of an hour. */
const RECENT_MS = 15 * 60_000;

/**
 * The cards that just landed, newest first, read off the board itself: it fills as the mercado
 * runs, survives a reconnect, and someone arriving late still sees the last few.
 */
export default function ProposalFeed({
  tracks,
  rooms,
  now,
  className,
}: {
  tracks: StickyNote[];
  rooms: BoardRoom[];
  now: number;
  className?: string;
}) {
  const recent = useMemo(
    () =>
      tracks
        .filter((track) => now - new Date(track.createdAt).getTime() < RECENT_MS)
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, SHOWN),
    [tracks, now]
  );

  if (recent.length === 0) return null;

  return (
    <section
      aria-label="Propuestas recién agregadas"
      className={classNames("border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}
    >
      <h2 className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase">
        Recién propuesto
      </h2>
      <ul className="divide-y divide-[#FBF5E7]/10">
        {recent.map((track) => {
          const room = rooms.find((candidate) => candidate.id === track.roomId);

          return (
            <li key={track.id} className="conf-rise flex items-start gap-3 px-5 py-3 [--rise:10px]">
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rotate-45"
                style={{ backgroundColor: room?.color ?? "#F5BB03" }}
              />
              <span className="min-w-0">
                <span className="block text-sm leading-snug text-[#FBF5E7]">{track.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[#FBF5E7]/65">
                  {[room?.name ?? track.room, track.timeSlot.split(" - ")[0], track.speaker]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
