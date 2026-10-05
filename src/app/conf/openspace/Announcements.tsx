"use client";

import classNames from "classnames";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

/**
 * Staff messages addressed to attendees. The staff realtime channel is
 * publicly subscribable and its broadcasts are content-free by design, so a
 * ping only triggers a refetch — the text itself always comes from the public
 * read, which filters to audience = "attendees".
 */
export default function Announcements({
  eventId,
  timezone,
  className,
}: {
  eventId: string;
  timezone: string;
  className?: string;
}) {
  const { data = [], refetch } = useQuery({
    queryKey: ["announcements", "public", eventId],
    queryFn: () => client.staffTasks.announcements.listPublic({ eventId }),
    staleTime: 30_000,
  });

  const onPing = useCallback(
    (event: string) => {
      if (event === "announcement_created" || event === "tasks_changed") void refetch();
    },
    [refetch]
  );

  useRealtimeChannel(eventChannel(eventId, "staff"), onPing);

  if (data.length === 0) return null;

  // 24h to match the block times the rest of the page shows (es-UY defaults to 12h).
  const time = new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });

  return (
    <section
      aria-label="Anuncios de la organización"
      className={classNames("border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}
    >
      <p className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
        Avisos
      </p>
      <ul aria-live="polite" className="divide-y divide-[#FBF5E7]/10">
        {data.map((announcement) => (
          <li
            key={announcement.id}
            className={classNames("px-5 py-3.5", announcement.urgent && "border-l-2 border-l-[#F5BB03]")}
          >
            <p
              className={classNames(
                "text-pretty text-sm leading-relaxed",
                announcement.urgent ? "text-[#FBF5E7]" : "text-[#FBF5E7]/80"
              )}
            >
              {announcement.body}
            </p>
            <p className="mt-1.5 text-xs tabular-nums text-[#FBF5E7]/40">
              {time.format(new Date(announcement.createdAt))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
