import { createId } from "@paralleldrive/cuid2";
import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { attendees, communities, emailDeliveries, surveys } from "lib/db/schema";
import { signLink } from "lib/links";
import { presetQuestion } from "lib/organizar/presets";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeUser } from "test/factories";

import { sendConfirmPings, sendFeedback, sendNoShowNudges, sendReminders } from "./service";

const HOUR = 3_600_000;
const run = Effect.runPromiseWith(liveServices);
const earlier = (hours: number) => new Date(Date.now() - hours * HOUR);

/** A published event with OWU sign-up starting `hours` from now (negative: already over), 2 h long. */
async function eventIn(hours: number, overrides: Parameters<typeof makeEvent>[1] = {}, communityId?: string) {
  const community = communityId ? { id: communityId } : await makeCommunity();
  const startDate = new Date(Date.now() + hours * HOUR);
  const event = await makeEvent(community.id, {
    status: "published",
    registration: "owu",
    startDate,
    endDate: new Date(startDate.getTime() + 2 * HOUR),
    ...overrides,
  });

  return { communityId: community.id, event };
}

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

const rowOf = async (id: string) => (await db.select().from(attendees).where(eq(attendees.id, id)))[0];

describe("confirm or release from the reminder", () => {
  test("the 48 h reminder carries Voy and No puedo ir, the waitlist's size and other events this week", async () => {
    const { event } = await eventIn(40, { capacity: 10 });
    const person = await makeRsvp(event.id, { registeredAt: earlier(72) });
    await makeRsvp(event.id, { status: "waitlisted" });
    await eventIn(100, { name: "Otro meetup de la semana" });

    await run(sendReminders);

    const [reminder] = await mail(person.email, "rsvp_reminder_48h");
    expect(reminder.text).toMatch(
      /Voy: \S+\/entrada\?t=\S+&accion=confirmar\nNo puedo ir · liberar mi lugar: \S+&accion=liberar/
    );
    expect(reminder.text).toContain("Hay 1 persona en lista de espera; si no podés, liberá tu lugar.");
    // Other tests' events share the week: at most three, never this one
    const footer = reminder.text.split("Otros eventos de OWU esta semana:\n")[1]?.split("\n\n")[0] ?? "";
    expect(footer.split("\n").filter((line) => line.startsWith("- ")).length).toBeGreaterThan(0);
    expect(footer.split("\n").length).toBeLessThanOrEqual(3);
    expect(footer).not.toContain(`/events/${event.slug}`);
  });

  test("Voy needs a valid link for that event; a GET never changes anything; the link lapses at the start", async () => {
    const { event } = await eventIn(30, { capacity: 10 });
    const elsewhere = await eventIn(30);
    const person = await makeRsvp(event.id);
    const token = await signLink("ticket", person.id, event.startDate);
    const confirm = (input: { token: string; eventId: string }) => call(router.rsvps.confirmByLink, input, by(null));

    // Opening the page (the ticket query) doesn't confirm
    await call(router.rsvps.ticket, { token }, by(null));
    expect((await rowOf(person.id))?.confirmedAt).toBeNull();

    // Forged, for another event, lapsed
    const lapsed = await signLink("ticket", person.id, earlier(1));
    const refused = await Promise.allSettled([
      confirm({ token: `${token}x`, eventId: event.id }),
      confirm({ token, eventId: elsewhere.event.id }),
      confirm({ token: lapsed, eventId: event.id }),
    ]);
    expect(
      refused.map((outcome) => outcome.status === "rejected" && (outcome.reason as { code: string }).code)
    ).toStrictEqual(["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"]);

    await expect(confirm({ token, eventId: event.id })).resolves.toMatchObject({
      status: "attending",
      confirmedAt: expect.any(String),
    });
    const first = (await rowOf(person.id))?.confirmedAt;
    await confirm({ token, eventId: event.id });
    expect((await rowOf(person.id))?.confirmedAt).toStrictEqual(first);
  });

  test("No puedo ir frees the seat for the next in line; the same link can't confirm after", async () => {
    const { event } = await eventIn(30, { capacity: 1 });
    const person = await makeRsvp(event.id);
    const next = await makeRsvp(event.id, { status: "waitlisted" });
    const token = await signLink("ticket", person.id, event.startDate);
    const elsewhere = await eventIn(30);

    await expect(
      call(router.rsvps.leaveByToken, { token, eventId: elsewhere.event.id }, by(null))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call(router.rsvps.leaveByToken, { token, eventId: event.id }, by(null))).resolves.toMatchObject({
      status: "cancelled",
    });

    expect((await rowOf(person.id))?.cancelledAt).toBeInstanceOf(Date);
    // 30 h ahead: the next in line gets it offered for a few hours
    expect((await rowOf(next.id))?.status).toBe("offered");
    await expect(call(router.rsvps.confirmByLink, { token, eventId: event.id }, by(null))).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("a day before, only people who didn't say Voy are asked again, once, when a seat is worth freeing", async () => {
    const { event } = await eventIn(20, { capacity: 30 });
    const [quiet, confirmed] = await Promise.all([
      makeRsvp(event.id, { registeredAt: earlier(72) }),
      makeRsvp(event.id, { registeredAt: earlier(72), confirmedAt: earlier(1) }),
    ]);
    const off = await eventIn(20, { capacity: 30, confirmPing: false });
    const unlimited = await eventIn(20, { capacity: null, waitlist: false });
    const [offPerson, unlimitedPerson] = await Promise.all([
      makeRsvp(off.event.id, { registeredAt: earlier(72) }),
      makeRsvp(unlimited.event.id, { registeredAt: earlier(72) }),
    ]);

    await run(sendConfirmPings);
    await run(sendConfirmPings);

    const pings = await mail(quiet.email, "rsvp_confirm_ping");
    expect(pings).toHaveLength(1);
    expect(pings[0]?.subject).toBe(`¿Seguís viniendo a ${event.name}? Es mañana`);
    expect(pings[0]?.text).toContain("&accion=confirmar");
    // Not who said Voy, not when the team turned it off, not when there's no seat to free
    const others = await Promise.all(
      [confirmed, offPerson, unlimitedPerson].map((person) => mail(person.email, "rsvp_confirm_ping"))
    );
    expect(others.map((sent) => sent.length)).toStrictEqual([0, 0, 0]);
  });
});

describe("feedback goes to the right people", () => {
  test("when the door was used, only to the people who came", async () => {
    const { event } = await eventIn(-6);
    await db.insert(surveys).values({ eventId: event.id, title: "¿Qué tal?", isOpen: true });
    const came = await makeRsvp(event.id, { checkedInAt: earlier(7), checkinSource: "owu" });
    const missed = await makeRsvp(event.id);

    await run(sendFeedback);

    await expect(mail(came.email, "rsvp_feedback")).resolves.toHaveLength(1);
    await expect(mail(missed.email, "rsvp_feedback")).resolves.toHaveLength(0);
  });

  test("without door data, to everyone who had a seat", async () => {
    const { event } = await eventIn(-6);
    await db.insert(surveys).values({ eventId: event.id, title: "¿Qué tal?", isOpen: true });
    const [ana, beto] = await Promise.all([makeRsvp(event.id), makeRsvp(event.id)]);

    await run(sendFeedback);

    await expect(mail(ana.email, "rsvp_feedback")).resolves.toHaveLength(1);
    await expect(mail(beto.email, "rsvp_feedback")).resolves.toHaveLength(1);
  });
});

describe("sign-ups close at the start", () => {
  test("refused after the start when no close time is set, and after the team's close time", async () => {
    const [ana, beto] = await Promise.all([makeUser({ name: "Ana" }), makeUser({ name: "Beto" })]);
    const started = await eventIn(-0.5);
    const closing = await eventIn(30, { rsvpClosesAt: earlier(1) });

    await expect(call(router.rsvps.join, { eventId: started.event.id }, by(ana))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "closed" },
    });
    await expect(call(router.rsvps.join, { eventId: closing.event.id }, by(beto))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "closed" },
    });
  });
});

describe("attendance history", () => {
  /** A community with two past events where the door was used; `person` came to one and missed one. */
  async function withHistory(questions = [presetQuestion("dieta"), presetQuestion("ci")]) {
    const community = await makeCommunity();
    const person = await makeUser({ name: "Carla Repetida" });
    for (const [hours, came] of [
      [-24 * 30, true],
      [-24 * 15, false],
    ] as const) {
      const { event } = await eventIn(hours, {}, community.id);
      await makeRsvp(event.id, { checkedInAt: new Date(event.startDate.getTime() + 600_000), checkinSource: "owu" });
      await makeRsvp(event.id, {
        userId: person.id,
        checkedInAt: came ? new Date(event.startDate.getTime() + 600_000) : null,
        checkinSource: came ? "owu" : null,
      });
    }
    const { event } = await eventIn(24 * 5, { questions }, community.id);

    return { community, person, event };
  }

  test("organizers see who comes back and who's new; editors of another community see nothing", async () => {
    const { community, person, event } = await withHistory();
    const admin = await makeMember(community.id, "admin");
    const outsider = await makeMember((await makeCommunity()).id, "admin");
    const newcomer = await makeRsvp(event.id, { name: "Nadia Nueva" });
    await makeRsvp(event.id, { userId: person.id, name: "Carla Repetida" });
    const input = { eventId: event.id, pageSize: 50 } as const;

    const list = await call(router.attendees.list, input, by(admin));
    expect(list.rows.find((row) => row.name === "Carla Repetida")?.history).toMatchObject({
      attended: 1,
      noShows: 1,
      seated: 2,
    });
    expect(list.rows.find((row) => row.id === newcomer.id)?.history).toMatchObject({ seated: 0 });
    await expect(call(router.attendees.list, input, by(outsider))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("never on the public page, the ticket or the door search", async () => {
    const { community, person, event } = await withHistory();
    const admin = await makeMember(community.id, "admin");
    const seat = await makeRsvp(event.id, { userId: person.id, name: "Carla Repetida", showName: true });
    const doorUrl = (await call(router.events.doorLink, { communityId: community.id, eventId: event.id }, by(admin)))
      .url;
    const leaks = /attended|noShows|lateReleases|history|firstTime/;

    const page = await call(router.events.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null));
    const ticket = await call(router.rsvps.ticket, { token: await signLink("ticket", seat.id) }, by(null));
    const found = await call(router.door.search, { token: doorUrl.split("/puerta/")[1] ?? "", q: "carla" }, by(null));

    for (const shown of [page, ticket, found]) expect(JSON.stringify(shown)).not.toMatch(leaks);
  });

  test("the door greets first-timers and shows the photo preference", async () => {
    const { community, person, event } = await withHistory([presetQuestion("foto")]);
    const member = await makeMember(community.id, "member");
    const [back, newcomer] = await Promise.all([
      makeRsvp(event.id, { userId: person.id }),
      makeRsvp(event.id, { answers: { foto: "No" } }),
    ]);
    const scan = (code: string | null) =>
      call(router.attendees.scan, { eventId: event.id, code: code ?? "", nonce: createId() }, by(member));

    await expect(scan(back.barcode)).resolves.toMatchObject({ attendee: { firstTime: false, photo: null } });
    await expect(scan(newcomer.barcode)).resolves.toMatchObject({
      attendee: { firstTime: true, photo: "Sin fotos" },
    });
  });

  test("an editor reviews pending people by name and answers: no emails, never the ID", async () => {
    const { community, person, event } = await withHistory();
    const [editor, admin] = await Promise.all([makeMember(community.id, "editor"), makeMember(community.id, "admin")]);
    const waiting = await makeRsvp(event.id, {
      userId: person.id,
      status: "pending",
      answers: { dieta: "Vegana", ci: "1.234.567-8" },
    });
    const input = { communityId: community.id, eventId: event.id };

    const pending = await call(router.rsvps.pending, input, by(editor));
    expect(pending).toStrictEqual([
      {
        id: waiting.id,
        name: waiting.name,
        guests: 0,
        registeredAt: expect.any(String),
        answers: [{ label: presetQuestion("dieta").label, value: "Vegana" }],
        history: { attended: 1, noShows: 1, lateReleases: 0, excused: 0, seated: 2 },
      },
    ]);
    expect((await call(router.rsvps.pending, input, by(admin)))[0]?.answers).toHaveLength(2);
    await expect(call(router.attendees.list, { eventId: event.id }, by(editor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(
      call(router.rsvps.review, { ...input, attendeeId: waiting.id, decision: "approve" }, by(editor))
    ).resolves.toMatchObject({ status: "attending" });
    await expect(mail(waiting.email, "rsvp_confirmed")).resolves.toHaveLength(1);
  });

  test("a first seat with a community brings the qué esperar email, once", async () => {
    const community = await makeCommunity();
    const ana = await makeUser({ name: "Ana Primera" });
    const [first, second] = await Promise.all([eventIn(24 * 10, {}, community.id), eventIn(24 * 20, {}, community.id)]);

    await call(router.rsvps.join, { eventId: first.event.id }, by(ana));
    await call(router.rsvps.join, { eventId: second.event.id }, by(ana));

    const welcome = await mail(ana.email, "rsvp_first_time");
    expect(welcome).toHaveLength(1);
    expect(welcome[0]?.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("review", () => {
  test("refuses cancelled and finished events", async () => {
    const community = await makeCommunity();
    const editor = await makeMember(community.id, "editor");
    const past = await eventIn(-5, { approval: true }, community.id);
    const cancelled = await eventIn(24, { approval: true, status: "cancelled" }, community.id);
    for (const { event } of [past, cancelled]) {
      const waiting = await makeRsvp(event.id, { status: "pending" });
      await expect(
        call(
          router.rsvps.review,
          { communityId: community.id, eventId: event.id, attendeeId: waiting.id, decision: "approve" },
          by(editor)
        )
      ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "closed" } });
    }
  });
});

describe("the no-show nudge", () => {
  /** Someone who had a seat at two events the door was used at, and came to neither. */
  async function twoNoShows(nudge: boolean) {
    const community = await makeCommunity({ noShowNudge: nudge });
    const person = await makeUser({ name: "Pato Ausente" });
    for (const hours of [-24 * 20, -5]) {
      const { event } = await eventIn(hours, {}, community.id);
      await makeRsvp(event.id, { checkedInAt: event.startDate, checkinSource: "owu" });
      await makeRsvp(event.id, { userId: person.id, email: person.email });
    }

    return { community, person };
  }

  test("is off by default", async () => {
    const { community, person } = await twoNoShows(false);
    expect((await db.select().from(communities).where(eq(communities.id, community.id)))[0]?.noShowNudge).toBe(false);

    await run(sendNoShowNudges);

    await expect(mail(person.email, "rsvp_noshow_nudge")).resolves.toHaveLength(0);
  });

  test("when on, goes once after the second silent no-show", async () => {
    const { person } = await twoNoShows(true);
    const once = await (async () => {
      const community = await makeCommunity({ noShowNudge: true });
      const solo = await makeUser();
      const { event } = await eventIn(-5, {}, community.id);
      await makeRsvp(event.id, { checkedInAt: event.startDate, checkinSource: "owu" });
      await makeRsvp(event.id, { userId: solo.id, email: solo.email });
      return solo;
    })();

    await run(sendNoShowNudges);
    await run(sendNoShowNudges);

    const nudges = await mail(person.email, "rsvp_noshow_nudge");
    expect(nudges).toHaveLength(1);
    expect(nudges[0]?.text).toContain("si no podés, liberá tu lugar");
    await expect(mail(once.email, "rsvp_noshow_nudge")).resolves.toHaveLength(0);
  });
});
