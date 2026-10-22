import { wallClock } from "lib/slot-day";

/**
 * An event's start and end are instants; its settings show them on the event's own wall clock
 * (its time zone), whatever the browser's zone is.
 */

/** "2026-11-07" and "14:30" of an instant on a zone's wall clock. */
export function toWallClock(at: string | Date, timeZone: string): { day: string; time: string } {
  const [day, time] = wallClock(new Date(at), timeZone).split("T");

  return { day, time };
}

/** The instant a zone's wall clock reads `day` at `time`: the inverse of `toWallClock`. */
export function fromWallClock(day: string, time: string, timeZone: string): Date {
  const target = Date.parse(`${day}T${time}:00Z`);
  let guess = target;
  // The first correction applies the zone's offset; the second settles a DST change in between.
  for (let step = 0; step < 2; step += 1) {
    guess += target - Date.parse(`${wallClock(new Date(guess), timeZone)}:00Z`);
  }

  return new Date(guess);
}

/** "UTC−3", "UTC+5:30", "UTC" for a zone at an instant. */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  // Engines differ on UTC itself: "GMT" or "GMT+0".
  return name === "GMT+0" ? "UTC" : name.replace("GMT", "UTC").replace("-", "−");
}

export const DEFAULT_TIME_ZONE = "America/Montevideo";

/** Every zone the browser knows, ours first; a stored zone outside the list (an alias) stays in it. */
export function timeZoneOptions(current?: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone").filter((zone) => zone !== DEFAULT_TIME_ZONE);
  const extra = current && current !== DEFAULT_TIME_ZONE && !zones.includes(current) ? [current] : [];

  return [DEFAULT_TIME_ZONE, ...extra, ...zones];
}
