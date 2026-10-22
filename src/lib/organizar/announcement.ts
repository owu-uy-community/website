import { shortWhen } from "../community/time";

/**
 * Owy's post about a new event on OWU's Slack and Telegram. Written from the event's own fields,
 * never free text: organizers choose where, not what, so nobody can make Owy say anything else.
 */
export function announcementText(event: {
  name: string;
  summary: string | null;
  startDate: string;
  place: string;
  community: string;
  url: string;
}) {
  return [
    `📣 ${event.community}: ${event.name}`,
    event.summary ?? "",
    `🗓 ${shortWhen(event.startDate)} · 📍 ${event.place}`,
    `👉 ${event.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Slack reads <…> as mentions and links (<!channel>, <@U123>): escaped, the text is only text. */
export const slackSafe = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
