import { slotDay, wallClock } from "lib/slot-day";

type Slot = { id: string; name: string; startTime: string; endTime: string; date: string; isActive: boolean };
type Talk = { scheduleId: string; roomId: string };

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * What a room has going on at `now`, read on the event's wall clock (never the UTC date): the
 * block on now, with its talk in this room (if any) and the time the block has left, and the
 * next talk in this room on any later block.
 */
export function roomNow<T extends Talk>(slots: Slot[], talks: T[], roomId: string, now: number, timeZone: string) {
  const clock = wallClock(new Date(now), timeZone);
  const [today, time] = [clock.slice(0, 10), clock.slice(11)];
  const nowMin = minutes(time) + new Date(now).getUTCSeconds() / 60;
  const talkIn = (slot: Slot) => talks.find((talk) => talk.scheduleId === slot.id && talk.roomId === roomId);
  const sorted = slots
    .filter((slot) => slot.isActive)
    .map((slot) => ({ ...slot, day: slotDay(slot.date) }))
    .toSorted((a, b) => `${a.day}T${a.startTime}`.localeCompare(`${b.day}T${b.startTime}`));

  const current = sorted.find((slot) => slot.day === today && slot.startTime <= time && time < slot.endTime);
  const next = sorted.find((slot) => `${slot.day}T${slot.startTime}` > clock && talkIn(slot));

  return {
    today,
    current: current
      ? {
          slot: current,
          talk: talkIn(current),
          leftMs: Math.max(0, (minutes(current.endTime) - nowMin) * 60_000),
          lengthMs: (minutes(current.endTime) - minutes(current.startTime)) * 60_000,
        }
      : null,
    next: next ? { slot: next, talk: talkIn(next) as T } : null,
  };
}
