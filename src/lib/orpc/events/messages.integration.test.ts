import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, eventMessages } from "lib/db/schema";
import { presetQuestion } from "lib/organizar/presets";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp } from "test/factories";

import { sendScheduled } from "./messages";

const HOUR = 3_600_000;
const run = Effect.runPromiseWith(liveServices);

async function setup(hours: number, overrides: Parameters<typeof makeEvent>[1] = {}) {
  const community = await makeCommunity();
  const admin = await makeMember(community.id, "admin");
  const startDate = new Date(Date.now() + hours * HOUR);
  const event = await makeEvent(community.id, {
    status: "published",
    registration: "owu",
    startDate,
    endDate: new Date(startDate.getTime() + 2 * HOUR),
    ...overrides,
  });

  return { community, admin, event, ref: { communityId: community.id, eventId: event.id } };
}

const mail = (to: string, kind = "event_message") =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

const text = { subject: "Gracias por venir", body: "Acá están las slides de la charla de anoche." };

describe("after the event, by whether people came", () => {
  test("vinieron, no vinieron and the waitlist that didn't get in are each their own audience", async () => {
    const { admin, event, ref } = await setup(-6);
    const came = await makeRsvp(event.id, { checkedInAt: event.startDate, checkinSource: "owu" });
    const missed = await makeRsvp(event.id);
    const left = await makeRsvp(event.id, { status: "waitlisted" });
    const send = (to: "came" | "missed" | "waitlist-left") =>
      call(router.events.message, { ...ref, to: [to], ...text, body: `${text.body} (${to})` }, by(admin));

    await expect(send("came")).resolves.toStrictEqual({ sent: 1 });
    await expect(send("missed")).resolves.toStrictEqual({ sent: 1 });
    await expect(send("waitlist-left")).resolves.toStrictEqual({ sent: 1 });

    for (const [person, audience] of [
      [came, "came"],
      [missed, "missed"],
      [left, "waitlist-left"],
    ] as const) {
      const got = await mail(person.email);
      expect(got.map((row) => row.text.includes(`(${audience})`))).toStrictEqual([true]);
    }
    await expect(call(router.events.stats, ref, by(admin))).resolves.toMatchObject({
      checkedIn: 1,
      missed: 1,
      waitlisted: 1,
    });
    const log = await call(router.events.messages, ref, by(admin));
    expect(log.map((row) => [row.audience, row.status, row.recipients])).toStrictEqual(
      expect.arrayContaining([
        ["came", "sent", 1],
        ["missed", "sent", 1],
        ["waitlist-left", "sent", 1],
      ])
    );
  });

  test("without door data nobody counts as not having come", async () => {
    const { admin, event, ref } = await setup(-6);
    await makeRsvp(event.id);

    await expect(call(router.events.message, { ...ref, to: ["missed"], ...text }, by(admin))).resolves.toStrictEqual({
      sent: 0,
    });
  });
});

describe("scheduled messages", () => {
  test("a due one goes out once through the outbox; a cancelled one never does", async () => {
    const { admin, event, ref } = await setup(48);
    const person = await makeRsvp(event.id);
    const later = new Date(Date.now() + 2 * HOUR).toISOString();
    const schedule = (subject: string) =>
      call(
        router.events.scheduleMessage,
        { ...ref, to: "attending", subject, body: text.body, sendAt: later },
        by(admin)
      );

    await expect(
      call(
        router.events.scheduleMessage,
        { ...ref, to: "attending", ...text, sendAt: new Date(Date.now() - HOUR).toISOString() },
        by(admin)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const due = await schedule("Mañana: cambió la sala");
    const called = await schedule("Este no sale");
    await call(router.events.cancelMessage, { ...ref, messageId: called.id }, by(admin));
    await expect(call(router.events.cancelMessage, { ...ref, messageId: called.id }, by(admin))).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await run(sendScheduled);
    await expect(mail(person.email)).resolves.toHaveLength(0);

    await db
      .update(eventMessages)
      .set({ sendAt: new Date(Date.now() - 60_000) })
      .where(eq(eventMessages.eventId, event.id));
    await Promise.all([run(sendScheduled), run(sendScheduled)]);
    await run(sendScheduled);

    const got = await mail(person.email);
    expect(got.map((row) => row.subject)).toStrictEqual([`Mañana: cambió la sala · ${event.name}`]);
    const log = await call(router.events.messages, ref, by(admin));
    expect(
      [due.id, called.id].map((id) => log.find((row) => row.id === id)).map((row) => [row?.status, row?.recipients])
    ).toStrictEqual([
      ["sent", 1],
      ["cancelled", 0],
    ]);
  });

  test("a test goes only to the organizer, marked, and editors can't write to people", async () => {
    const { community, admin, event, ref } = await setup(48);
    const person = await makeRsvp(event.id);
    const editor = await makeMember(community.id, "editor");

    await expect(call(router.events.messageTest, { ...ref, ...text }, by(admin))).resolves.toStrictEqual({
      to: admin.email,
    });

    await expect(mail(admin.email, "event_message_test")).resolves.toMatchObject([
      { subject: `[Prueba] ${text.subject} · ${event.name}` },
    ]);
    await expect(mail(person.email)).resolves.toHaveLength(0);
    await expect(call(router.events.messages, ref, by(editor))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("how many to expect", () => {
  test("the range comes from the default show rate, and the food counts the diet answers", async () => {
    const { admin, event, ref } = await setup(48, { questions: [presetQuestion("dieta")], capacity: 60 });
    for (const dieta of ["Vegana", "Sin TACC", "Como de todo", "Vegetariana"]) {
      await makeRsvp(event.id, { answers: { dieta } });
    }
    await makeRsvp(event.id, { guests: 1, confirmedAt: new Date() });

    const stats = await call(router.events.stats, ref, by(admin));

    expect(stats).toMatchObject({ attending: 5, guests: 1, confirmed: 1 });
    expect(stats.turnout).toMatchObject({
      rate: 0.55,
      fromHistory: false,
      events: 0,
      diets: { vegetarian: 2, glutenFree: 1, answered: 4 },
    });
    expect(stats.turnout.low).toBeLessThanOrEqual(stats.turnout.likely);
    expect(stats.turnout.likely).toBeLessThanOrEqual(stats.turnout.high);
    expect(stats.turnout.food.drinks).toBe(stats.turnout.likely * 2);
  });
});
