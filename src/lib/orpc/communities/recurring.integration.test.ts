import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { addDays, weekdayOf } from "lib/calendar/holidays";
import { dayKey } from "lib/community/time";
import { db } from "lib/db";
import { emailDeliveries, type RecurringSlot } from "lib/db/schema";
import { nudgeEmptySlots } from "lib/orpc/communities/recurring";
import { liveServices } from "lib/orpc/services";
import { makeCommunity, makeEvent, makeMember } from "test/factories";

const run = () => Effect.runPromiseWith(liveServices)(nudgeEmptySlots);

const mailTo = (email: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, email), eq(emailDeliveries.kind, "recurring_slot")));

/** A usual day that falls `days` from today: its weekday and its week of the month. */
function slotIn(days: number): { slot: RecurringSlot; day: string } {
  const day = addDays(dayKey(new Date()), days);
  const week = Math.ceil(Number(day.slice(8)) / 7);

  return { day, slot: { weekday: weekdayOf(day), nth: week > 4 ? -1 : week, time: "19:00", durationMin: 120 } };
}

async function setup(days = 40, overrides: Parameters<typeof makeCommunity>[0] = {}) {
  const { slot, day } = slotIn(days);
  const community = await makeCommunity({ name: "Comunidad de los jueves", recurringSlot: slot, ...overrides });
  const [editor, member] = await Promise.all([makeMember(community.id, "editor"), makeMember(community.id, "member")]);

  return { community, editor, member, day };
}

describe("the usual-day nudge (sweep)", () => {
  test("six weeks before an empty usual day, each organizer gets one email however often the tick runs", async () => {
    const { community, editor, member, day } = await setup();

    await run();
    await run();

    const mails = await mailTo(editor.email);
    expect(mails.map((mail) => mail.dedupeKey)).toStrictEqual([
      `recurring_slot:${community.id}:${day}:${editor.email}`,
    ]);
    expect(mails[0].text).toContain("no tiene evento: ¿lo armamos, lo cedemos o hacemos algo liviano?");
    expect(mails[0].text).toContain(`/organizar/panel/${community.slug}/calendario?dia=${day}&hora=19:00&dur=120`);
    // Members help at the door: they don't plan the calendar
    await expect(mailTo(member.email)).resolves.toHaveLength(0);
  });

  test("a day with an event or a live hold, one still far off, or a pause without a return date: no email", async () => {
    const held = await setup();
    await makeEvent(held.community.id, {
      status: "draft",
      heldUntil: new Date(Date.now() + 10 * 86_400_000),
      startDate: new Date(`${held.day}T22:00:00Z`),
      endDate: new Date(`${held.day}T23:59:00Z`),
    });
    const far = await setup(50);
    const paused = await setup(40, { status: "pausa" });

    await run();

    for (const { editor } of [held, far, paused]) await expect(mailTo(editor.email)).resolves.toHaveLength(0);
  });

  test("a pause that ends before the day doesn't silence it", async () => {
    const back = await setup(40, { status: "pausa", pausedUntil: addDays(dayKey(new Date()), 20) });

    await run();

    await expect(mailTo(back.editor.email)).resolves.toHaveLength(1);
  });
});
