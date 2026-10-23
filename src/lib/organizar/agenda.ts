/**
 * A talk night's agenda, made from its talks: doors and networking, a welcome, the talks by
 * length, the lightning talks together, and networking to close. Each moment starts when the one
 * before ends, so editing a length or the order moves what comes after. Client-safe.
 */
import type { TalkFormat } from "../db/schema";
import { toClock, toMinutes } from "../orpc/run-of-show/timing";

/** Minutes per talk format; a talk typed by hand (no format) gets a regular slot. */
export const TALK_MINUTES: Record<TalkFormat, number> = { relampago: 5, corta: 20, larga: 40, taller: 40 };
const DEFAULT_TALK_MINUTES = TALK_MINUTES.corta;

export const DOORS_MIN = 30;
export const WELCOME_MIN = 5;
export const CLOSING_MIN = 30;

export type AgendaTalk = { title: string; speaker: string; format: TalkFormat | null };
export type AgendaItem = { title: string; durationMin: number };

const named = (talk: AgendaTalk) =>
  talk.speaker.trim() ? `${talk.title.trim()} · ${talk.speaker.trim()}` : talk.title.trim();

/** The agenda for these talks, in order: long ones first as given, lightning talks together at the end. */
export function meetupAgenda(talks: readonly AgendaTalk[]): AgendaItem[] {
  const given = talks.filter((talk) => talk.title.trim());
  const lightning = given.filter((talk) => talk.format === "relampago");
  const regular = given.filter((talk) => talk.format !== "relampago");

  return [
    { title: "Puertas abiertas y networking", durationMin: DOORS_MIN },
    { title: "Bienvenida", durationMin: WELCOME_MIN },
    ...regular.map((talk) => ({
      title: named(talk),
      durationMin: talk.format ? TALK_MINUTES[talk.format] : DEFAULT_TALK_MINUTES,
    })),
    ...lightning.map((talk) => ({ title: `Relámpago: ${named(talk)}`, durationMin: TALK_MINUTES.relampago })),
    { title: "Networking y cierre", durationMin: CLOSING_MIN },
  ];
}

/** Planned starts ("HH:MM"), one after the other from `start`. */
export function withStarts<T extends { durationMin: number }>(items: readonly T[], start: string) {
  let at = toMinutes(start);

  return items.map((item) => {
    const plannedStart = toClock(at);
    at += item.durationMin;

    return { ...item, plannedStart };
  });
}

/** Where `item` lands after a move up (−1) or down (+1); the list unchanged at either end. */
export function moveItem<T>(items: readonly T[], index: number, by: -1 | 1) {
  const to = index + by;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];

  return next;
}
