import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { POST as unsubscribe } from "app/api/email/unsubscribe/route";
import { db } from "lib/db";
import { emailDeliveries, emailSuppressions, events, surveys } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";

import { sendFeedback, sendReminders, sendUpdates } from "./service";

const HOUR_MS = 3_600_000;
const run = Effect.runPromiseWith(liveServices);

async function eventIn(hours: number, overrides: Parameters<typeof makeEvent>[1] = {}) {
  const community = await makeCommunity();
  const startDate = new Date(Date.now() + hours * HOUR_MS);
  const event = await makeEvent(community.id, {
    status: "published",
    registration: "owu",
    startDate,
    endDate: new Date(startDate.getTime() + 2 * HOUR_MS),
    ...overrides,
  });
  const person = await makeRsvp(event.id, { registeredAt: new Date(Date.now() - 3 * 24 * HOUR_MS) });

  return { community, event, person };
}

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

const invite = (row: { attachments: { content: string }[] }) =>
  Buffer.from(row.attachments[0]?.content ?? "", "base64").toString();

describe("reminders", () => {
  test("two days before, once; two hours before, with the QR; and they can be turned off", async () => {
    const soon = await eventIn(30);
    const today = await eventIn(1.5);
    const quiet = await eventIn(30);
    await db.insert(emailSuppressions).values({ email: quiet.person.email.toLowerCase() });

    await run(sendReminders);
    await run(sendReminders);

    const [reconfirm] = await mail(soon.person.email, "rsvp_reminder_48h");
    await expect(mail(soon.person.email, "rsvp_reminder_48h")).resolves.toHaveLength(1);
    expect(reconfirm.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    await expect(mail(today.person.email, "rsvp_reminder_2h")).resolves.toMatchObject([
      { html: expect.stringContaining("/api/tickets/qr?t=") },
    ]);
    await expect(mail(quiet.person.email, "rsvp_reminder_48h")).resolves.toHaveLength(0);
  });

  test("the confirm page's form unsubscribes; a bad link doesn't", async () => {
    const { person } = await eventIn(30);
    await run(sendReminders);
    const [reminder] = await mail(person.email, "rsvp_reminder_48h");
    const token = /baja\?t=(\S+)$/m.exec(reminder.text)?.[1] ?? "";
    const post = (value: string) =>
      unsubscribe(new NextRequest(`http://localhost/api/email/unsubscribe?t=${value}`, { method: "POST" }));

    expect((await post(`${token}x`)).status).toBe(400);
    expect((await post(token)).status).toBe(200);
    await expect(
      db.select().from(emailSuppressions).where(eq(emailSuppressions.email, person.email.toLowerCase()))
    ).resolves.toHaveLength(1);
  });
});

describe("changes", () => {
  test("a moved event tells its people once, ten minutes after the last edit, with the updated invite", async () => {
    const { community, event, person } = await eventIn(24 * 20);
    const editor = await makeMember(community.id, "editor");
    const editable = await call(router.events.get, { communityId: community.id, eventId: event.id }, by(editor));
    const day = new Date(event.startDate.getTime() + 7 * 24 * HOUR_MS).toISOString().slice(0, 10);
    await call(
      router.events.save,
      {
        communityId: community.id,
        eventId: event.id,
        expectedUpdatedAt: editable.updatedAt,
        patch: { schedule: { day, startTime: "19:00", durationMin: 120 } },
      },
      by(editor)
    );

    await run(sendUpdates);
    await expect(mail(person.email, "rsvp_updated")).resolves.toHaveLength(0);
    const settled = new Date(Date.now() - 15 * 60_000);
    await db.update(events).set({ updatedAt: settled }).where(eq(events.id, event.id));
    await run(sendUpdates);
    await run(sendUpdates);

    const updates = await mail(person.email, "rsvp_updated");
    expect(updates).toHaveLength(1);
    expect(invite(updates[0])).toContain("SEQUENCE:1");
    await expect(db.select().from(events).where(eq(events.id, event.id))).resolves.toMatchObject([
      { notifiedSequence: 1, updatedAt: settled },
    ]);
  });

  test("a cancelled event takes itself out of everyone's calendar", async () => {
    const { community, event, person } = await eventIn(24 * 20);
    const admin = await makeMember(community.id, "admin");

    await call(router.events.cancel, { communityId: community.id, eventId: event.id }, by(admin));

    const [notice] = await mail(person.email, "rsvp_event_cancelled");
    expect(invite(notice)).toContain("METHOD:CANCEL");
  });
});

describe("feedback", () => {
  test("the day after, attendees get the event's open survey", async () => {
    const { event, person } = await eventIn(-6);
    await db.insert(surveys).values({ eventId: event.id, title: "¿Qué tal?", isOpen: true });

    await run(sendFeedback);

    await expect(mail(person.email, "rsvp_feedback")).resolves.toMatchObject([
      { text: expect.stringContaining(`/events/${event.slug}/encuesta`) },
    ]);
  });
});
