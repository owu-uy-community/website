/**
 * Minimal RFC 5545 writer for the public events feed. Times go out in UTC, so
 * no VTIMEZONE block is needed and every calendar app places them correctly.
 */

export type IcsEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  url: string;
  description: string;
};

const TWO_HOURS = 2 * 3_600_000;

const utcStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1). */
function fold(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + width > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], options: { name: string; description: string; now?: Date }) {
  const stamp = utcStamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OWU Uruguay//Eventos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `X-WR-CALDESC:${escapeText(options.description)}`,
    "X-WR-TIMEZONE:America/Montevideo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const event of events) {
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : new Date(start.getTime() + TWO_HOURS);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@owu.uy`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `LOCATION:${escapeText(event.location ?? "Online")}`,
      `URL:${event.url}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export type Invite = {
  /** Stable per event and person, so updates and cancellations replace the same entry */
  uid: string;
  /** Goes up with every change; calendars ignore anything older than what they have */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  title: string;
  start: string;
  end: string;
  location: string;
  url: string;
  description: string;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
};

/**
 * A personal calendar invite (iTIP): REQUEST adds or updates the entry in the person's calendar,
 * CANCEL removes it. Sent with the confirmation, updates and cancellations.
 */
export function buildInvite(invite: Invite, now = new Date()) {
  const cn = (name: string) => `"${name.replace(/"/g, "'")}"`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OWU Uruguay//Organizá//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${invite.method}`,
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(new Date(invite.start))}`,
    `DTEND:${utcStamp(new Date(invite.end))}`,
    `SUMMARY:${escapeText(invite.title)}`,
    `DESCRIPTION:${escapeText(invite.description)}`,
    `LOCATION:${escapeText(invite.location)}`,
    `URL:${invite.url}`,
    `STATUS:${invite.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${cn(invite.organizer.name)}:mailto:${invite.organizer.email}`,
    `ATTENDEE;CN=${cn(invite.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${invite.attendee.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(fold).join("\r\n")}\r\n`;
}
