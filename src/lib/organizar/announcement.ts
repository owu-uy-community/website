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
    `📣 ${event.community}: ${unlinked(event.name)}`,
    unlinked(event.summary ?? ""),
    `🗓 ${shortWhen(event.startDate)} · 📍 ${event.place}`,
    `👉 ${event.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What organizers typed can't turn into a link in OWU's channels: Slack and Telegram link any
 * domain, address or scheme they see and Telegram any @handle, so every dot inside a word becomes
 * a look-alike dot (․), "://" loses its slashes and @ becomes ＠. «Node.js» still reads the same.
 */
export const unlinked = (text: string) =>
  text
    // Any dot inside a word (domains, IPs, any alphabet), any scheme, any handle
    .replace(/\.(?=\S)/g, "\u2024")
    .replace(/:\/\//g, ":\u2215\u2215")
    .replace(/@(?=\w)/g, "\uFF20");

/** Slack reads <…> as mentions and links (<!channel>, <@U123>): escaped, the text is only text. */
export const slackSafe = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
