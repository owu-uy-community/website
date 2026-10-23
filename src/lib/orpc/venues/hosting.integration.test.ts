import { call } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, like } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { db } from "lib/db";
import { emailDeliveries, surveyResponses, surveys, venueContacts, venues } from "lib/db/schema";
import { signLink } from "lib/links";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeUser, makeVenue } from "test/factories";

import { sendHostDaySheets, sendYearlyChecks } from "./hosting";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const run = Effect.runPromiseWith(liveServices);

const mail = (to: string, kind: string) =>
  db
    .select()
    .from(emailDeliveries)
    .where(and(eq(emailDeliveries.to, to), eq(emailDeliveries.kind, kind)));

async function setup() {
  const community = await makeCommunity({ name: `Comunidad ${createId().slice(0, 6)}` });
  const editor = await makeMember(community.id, "editor", { name: "Ana Organizadora" });

  return { community, editor };
}

/** A published event at `venueId`, starting `startsIn` from now, for 2 h. */
const eventAt = (communityId: string, venueId: string, startsIn: number, overrides = {}) =>
  makeEvent(communityId, {
    status: "published",
    registration: "owu",
    venueId,
    name: `Meetup ${createId().slice(0, 5)}`,
    startDate: new Date(Date.now() + startsIn),
    endDate: new Date(Date.now() + startsIn + 2 * HOUR),
    ...overrides,
  });

describe("the host recap", () => {
  /** A past event at a space: three came (one of them a regular), one didn't, two survey answers. */
  async function pastEvent() {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const regular = await makeUser({ name: "Rita Regular" });
    const earlier = await eventAt(community.id, venue.id, -60 * DAY);
    await makeRsvp(earlier.id, { userId: regular.id, name: regular.name });
    const event = await eventAt(community.id, venue.id, -3 * HOUR, {
      materials: [{ kind: "link", title: "Fotos", url: "https://fotos.example.com/album" }],
    });
    await makeRsvp(event.id, { userId: regular.id, name: regular.name, checkedInAt: new Date() });
    await makeRsvp(event.id, { name: "Nadia Nueva", checkedInAt: new Date() });
    await makeRsvp(event.id, { name: "Nico Nuevo", checkedInAt: new Date() });
    await makeRsvp(event.id, { name: "No Vino" });
    const [survey] = await db
      .insert(surveys)
      .values({
        eventId: event.id,
        title: "¿Qué tal?",
        isOpen: true,
        questions: [
          { id: "charlas", kind: "rating", label: "¿Y las charlas?" },
          { id: "para-el-espacio", kind: "text", label: "¿Algo para el espacio que nos recibió?" },
          { id: "privado", kind: "text", label: "¿Algo para el equipo?" },
        ],
      })
      .returning();
    await db.insert(surveyResponses).values([
      { surveyId: survey.id, respondent: createId(), answers: { charlas: 5, "para-el-espacio": "¡Qué lindo lugar!" } },
      { surveyId: survey.id, respondent: createId(), answers: { charlas: 4, privado: "Solo para el equipo" } },
    ]);

    return { editor, venue, ref: { communityId: community.id, eventId: event.id } };
  }
  const NAMES = ["Rita", "Nadia", "Nico", "No Vino", "Solo para el equipo"];

  test("numbers only: who came, the share of first-timers, the rating and the comments written for the host", async () => {
    const { editor, ref } = await pastEvent();

    const preview = await call(router.venues.recapPreview, ref, by(editor));

    expect(preview).toMatchObject({
      came: 3,
      fromDoor: true,
      firstTimers: expect.closeTo(2 / 3),
      rating: { average: 4.5, answers: 2 },
      comments: ["¡Qué lindo lugar!"],
      materials: [{ title: "Fotos", url: "https://fotos.example.com/album" }],
      recipients: 1,
      sentAt: null,
    });
    expect(NAMES.filter((name) => JSON.stringify(preview).includes(name))).toStrictEqual([]);
  });

  test("sending is once: the second send changes nothing, and the email carries the note but no names", async () => {
    const { editor, venue, ref } = await pastEvent();

    const sent = await call(router.venues.sendRecap, { ...ref, note: "¡Gracias por todo!" }, by(editor));
    const again = await call(router.venues.sendRecap, { ...ref, note: "Otra vez" }, by(editor));

    expect(again.sentAt).toBe(sent.sentAt);
    const mails = await mail(venue.contact?.email ?? "", "venue_recap");
    expect(
      mails.map((row) => [row.text.includes("3 personas vinieron"), row.text.includes("¡Gracias por todo!")])
    ).toStrictEqual([[true, true]]);
    expect(NAMES.filter((name) => mails[0]?.text.includes(name))).toStrictEqual([]);
  });

  test("not before the event ends, and not for a place outside the directory", async () => {
    const { community, editor } = await setup();
    const venue = await makeVenue();
    const upcoming = await eventAt(community.id, venue.id, 2 * DAY);
    const elsewhere = await makeEvent(community.id, { endDate: new Date(Date.now() - DAY) });

    await expect(
      call(router.venues.recapPreview, { communityId: community.id, eventId: upcoming.id }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "not_over" } });
    await expect(
      call(router.venues.recapPreview, { communityId: community.id, eventId: elsewhere.id }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "no_venue" } });
  });
});

describe("the host-day sheet and the ID list", () => {
  test("a week before, the space's contacts get the day's sheet once; not earlier", async () => {
    const { community } = await setup();
    const venue = await makeVenue();
    const soon = await eventAt(community.id, venue.id, 6 * DAY, { needs: ["proyector", "comida"], capacity: 50 });
    const later = await makeVenue();
    await eventAt(community.id, later.id, 9 * DAY);

    await run(sendHostDaySheets);
    await run(sendHostDaySheets);

    const sheets = await mail(venue.contact?.email ?? "", "venue_day_sheet");
    expect(
      sheets.map((sheet) => [soon.name, "unas 50", "Proyector, Comida"].map((part) => sheet.text.includes(part)))
    ).toStrictEqual([[true, true, true]]);
    await expect(mail(later.contact?.email ?? "", "venue_day_sheet")).resolves.toHaveLength(0);
  });

  test("at the building's deadline, the ID list: names and CI of who has a seat, only if the event asked it", async () => {
    const { community } = await setup();
    const strict = { idRequired: true, idDeadlineHours: 24 };
    const venue = await makeVenue({ facts: strict });
    const ci = { id: "ci", label: "Cédula (se la pasamos al edificio)", required: true, preset: "ci" as const };
    const due = await eventAt(community.id, venue.id, 20 * HOUR, { questions: [ci] });
    await makeRsvp(due.id, { name: "Ana Anotada", answers: { ci: "1.234.567-8" } });
    await makeRsvp(due.id, { name: "Wanda Espera", status: "waitlisted", answers: { ci: "9.999.999-9" } });
    const notYet = await makeVenue({ facts: strict });
    await eventAt(community.id, notYet.id, 40 * HOUR, { questions: [ci] });
    const noQuestion = await makeVenue({ facts: strict });
    await eventAt(community.id, noQuestion.id, 20 * HOUR);

    await run(sendHostDaySheets);
    await run(sendHostDaySheets);

    const lists = await Promise.all(
      [venue, notYet, noQuestion].map((space) => mail(space.contact?.email ?? "", "venue_id_list"))
    );
    expect(lists.map((rows) => rows.length)).toStrictEqual([1, 0, 0]);
    expect([
      lists[0]?.[0]?.text.includes("Ana Anotada\t1.234.567-8"),
      lists[0]?.[0]?.text.includes("Wanda"),
    ]).toStrictEqual([true, false]);
    // The sheet says by when the list goes out
    await expect(mail(venue.contact?.email ?? "", "venue_day_sheet")).resolves.toMatchObject([
      { text: expect.stringContaining("Lista para seguridad") },
    ]);
  });

  test("a contact an organizer reported gone gets neither the sheet nor the ID list", async () => {
    const { community } = await setup();
    const venue = await makeVenue({ facts: { idRequired: true, idDeadlineHours: 24 } });
    await db.update(venueContacts).set({ leftReportedAt: new Date() }).where(eq(venueContacts.venueId, venue.id));
    const ci = { id: "ci", label: "Cédula (se la pasamos al edificio)", required: true, preset: "ci" as const };
    const event = await eventAt(community.id, venue.id, 20 * HOUR, { questions: [ci] });
    await makeRsvp(event.id, { answers: { ci: "1.234.567-8" } });

    await run(sendHostDaySheets);

    const sent = await Promise.all(
      ["venue_day_sheet", "venue_id_list"].map((kind) => mail(venue.contact?.email ?? "", kind))
    );
    expect(sent.map((rows) => rows.length)).toStrictEqual([0, 0]);
  });
});

describe("the yearly check", () => {
  async function staleContact() {
    const venue = await makeVenue();
    await db
      .update(venueContacts)
      .set({ consentAt: new Date(Date.now() - 400 * DAY), lastConfirmedAt: new Date(Date.now() - 200 * DAY) })
      .where(eq(venueContacts.venueId, venue.id));
    const [contact] = await db.select().from(venueContacts).where(eq(venueContacts.venueId, venue.id));

    return { venue, contact };
  }

  test("asks a contact unconfirmed for 6 months, once a year", async () => {
    const { contact } = await staleContact();
    const fresh = await makeVenue();

    await run(sendYearlyChecks);
    await run(sendYearlyChecks);

    await expect(mail(contact.email, "venue_check")).resolves.toHaveLength(1);
    await expect(mail(fresh.contact?.email ?? "", "venue_check")).resolves.toHaveLength(0);
  });

  /** A stale contact, asked by the sweep, and the link from its email. */
  async function asked() {
    const { venue, contact } = await staleContact();
    await db.update(venues).set({ requestable: false }).where(eq(venues.id, venue.id));
    await run(sendYearlyChecks);
    const [email] = await db
      .select()
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.to, contact.email), like(emailDeliveries.dedupeKey, "venue_check:%")));
    const token = /\/espacios\/seguimos\/(\S+)$/.exec(email?.text ?? "")?.[1] ?? "";

    return {
      venue,
      token,
      contactRow: () => db.select().from(venueContacts).where(eq(venueContacts.id, contact.id)),
      venueRow: () => db.select().from(venues).where(eq(venues.id, venue.id)),
    };
  }

  test("opening the link shows the space and changes nothing", async () => {
    const { venue, token, contactRow } = await asked();
    const before = await contactRow();

    await expect(call(router.venues.checkByToken, { token }, by(null))).resolves.toMatchObject({
      venueName: venue.name,
      left: false,
    });
    await expect(contactRow()).resolves.toStrictEqual(before);
  });

  test("yes confirms and reopens requests (with the facts fixed), pause stops them, gone marks the contact", async () => {
    const { token, contactRow, venueRow } = await asked();

    await call(
      router.venues.checkAnswer,
      { token, answer: "yes", facts: { elevator: true, avNotes: "HDMI-C" } },
      by(null)
    );
    const [confirmed] = await contactRow();
    expect(Date.now() - (confirmed.lastConfirmedAt?.getTime() ?? 0)).toBeLessThan(60_000);
    await expect(venueRow()).resolves.toMatchObject([
      { requestable: true, facts: { elevator: true, avNotes: "HDMI-C" } },
    ]);

    await call(router.venues.checkAnswer, { token, answer: "pause" }, by(null));
    await expect(venueRow()).resolves.toMatchObject([{ requestable: false }]);

    await call(router.venues.checkAnswer, { token, answer: "left" }, by(null));
    await expect(contactRow()).resolves.toMatchObject([{ leftAt: expect.any(Date) }]);
  });

  test("once gone, the same link can't bring them back", async () => {
    const { token, contactRow } = await asked();
    await call(router.venues.checkAnswer, { token, answer: "left" }, by(null));

    await expect(call(router.venues.checkAnswer, { token, answer: "yes" }, by(null))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(contactRow()).resolves.toMatchObject([{ leftAt: expect.any(Date) }]);
  });

  test("a tampered or expired link opens nothing", async () => {
    const { contact } = await staleContact();
    const expired = await signLink("venue-check", contact.id, new Date(Date.now() - 1000));
    const otherPurpose = await signLink("venue-request", contact.id);

    for (const token of [expired, otherPurpose, `${expired.slice(0, -3)}abc`]) {
      await expect(call(router.venues.checkByToken, { token }, by(null))).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(call(router.venues.checkAnswer, { token, answer: "yes" }, by(null))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
});
