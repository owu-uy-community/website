"use client";

import classNames from "classnames";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

const SHOWN = 5;
/** Hundreds of phones hear the same ping: spread their refetches over a couple of seconds. */
const JITTER_MS = 2_000;

/** URLs in a message as links; the rest stays text (bodies are plain text, never HTML). */
function Linked({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        className="break-all underline decoration-[#F5BB03] underline-offset-2 hover:text-[#F5BB03]"
        href={part}
        rel="noopener noreferrer"
        target="_blank"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

/**
 * What the team told attendees through Owy (Telegram, Slack), newest first. The `ops` channel is
 * public and its pings carry nothing, so a ping only triggers a refetch of the public feed, which
 * never includes staff DMs.
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
  const { data = [], refetch } = useQuery(orpc.comms.feed.queryOptions({ input: { eventId }, staleTime: 30_000 }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPing = useCallback(
    (topic: string) => {
      if (topic !== "comms") return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refetch(), Math.random() * JITTER_MS);
    },
    [refetch]
  );
  useRealtimeChannel(eventChannel(eventId, "ops"), onPing);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (data.length === 0) return null;

  // 24 h like the rest of the board (es-UY defaults to 12 h)
  const time = new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });

  return (
    <section
      aria-label="Avisos del equipo"
      className={classNames("border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}
    >
      <h2 className="border-b border-[#FBF5E7]/12 px-5 py-3.5 font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase">
        Avisos del equipo
      </h2>
      <ul aria-live="polite" className="divide-y divide-[#FBF5E7]/10">
        {data.slice(0, SHOWN).map((message, index) => (
          <li key={message.id} className={classNames("px-5 py-3.5", index === 0 && "border-l-2 border-l-[#F5BB03]")}>
            <p className="text-sm leading-relaxed text-pretty whitespace-pre-line text-[#FBF5E7]/90">
              <Linked text={message.body} />
            </p>
            <p className="mt-1.5 text-xs text-[#FBF5E7]/60 tabular-nums">
              {time.format(new Date(message.sentAt))}
              {message.editedAt ? " · editado" : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
