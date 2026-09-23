"use client";

import classNames from "classnames";

import type { BoardRoom } from "./board";
import type { FeedEntry } from "./use-live-board";

type ProposalFeedProps = {
  entries: FeedEntry[];
  rooms: BoardRoom[];
  className?: string;
};

/**
 * Cards as they land on the board. Fed straight off the sync channel, so it
 * starts empty on every load and fills while you watch — there is no backfill
 * on purpose: this answers "what just happened", not "what happened today"
 * (the grid already answers that).
 */
export default function ProposalFeed({ entries, rooms, className }: ProposalFeedProps) {
  if (entries.length === 0) return null;

  return (
    <section
      aria-label="Propuestas recién agregadas"
      className={classNames("border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}
    >
      <p className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
        Recién propuesto
      </p>
      <ul aria-live="polite" className="divide-y divide-[#FBF5E7]/10">
        {entries.map((entry) => {
          const room = rooms.find((candidate) => candidate.id === entry.roomId);

          return (
            <li
              key={entry.key}
              className="flex animate-[fade-up_0.4s_cubic-bezier(0.2,0.7,0.2,1)_forwards] items-start gap-3 px-5 py-3"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rotate-45"
                style={{ backgroundColor: room?.color ?? "#F5BB03" }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm leading-snug text-[#FBF5E7]">{entry.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[#FBF5E7]/45">
                  {[room?.name, entry.timeSlot, entry.speaker].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
