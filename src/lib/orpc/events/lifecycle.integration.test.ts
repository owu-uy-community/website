import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { addDays, weekdayOf } from "lib/calendar/holidays";
import { clockTime, dayKey, montevideoIso } from "lib/community/time";
import { db } from "lib/db";
import {
  attendees,
  emailDeliveries,
  eventHosts,
  events,
  runOfShowItems,
  staffTaskAssignments,
  staffTasks,
} from "lib/db/schema";
import { issues } from "lib/organizar/steps";
import { nudgeDay } from "lib/organizar/task-templates";
import { router } from "lib/orpc/router";
import { liveServices } from "lib/orpc/services";
import { by } from "test/context";
import { makeCommunity, makeEvent, makeMember, makeRsvp, makeUser, makeVenue } from "test/factories";

import { sendTaskNudges } from "./lifecycle";
import { taskDay } from "./tasks";

const DAY_MS = 86_400_000;
const run = Effect.runPromiseWith(liveServices);

/** 19:00 in Montevideo, `days` from today */
const evening = (days: number) => {
  const startDate = new Date(montevideoIso(`${addDays(dayKey(new Date()), days)}T19:00`));

  return { startDate, endDate: new Date(startDate.getTime() + 2 * 3_600_000) };
};

async function team() {
  const community = await makeCommunity({ name: "Comunidad que repite" });
  const [editor, admin, member] = await Promise.all([
    makeMember(community.id, "editor"),
    makeMember(community.id, "admin"),
    makeMember(community.id, "member"),
  ]);

  return { community, editor, admin, member, ref: (eventId: string) => ({ communityId: community.id, eventId }) };
}

/** Last month's meetup, with everything a copy could carry and everything it never should. */
async function lastMonth(communityId: string, responders: string[]) {
  const venue = await makeVenue({ name: "Sala de siempre" });
  const other = await makeCommunity({ name: "Comunidad amiga" });
  const event = await makeEvent(communityId, {
    name: "Meetup de octubre",
    summary: "Tres charlas y pizza",
    description: "Charlas cortas de Python.",
    status: "published",
    publishedAt: new Date(),
    format: "charlas",
    registration: "owu",
    capacity: 50,
    questions: [{ id: "q1", label: "¿Comés carne?", required: false, preset: "dieta" }],
    volunteerRoles: ["puerta"],
    announcement: { channels: ["slack"] },
    reminderNote: "Entrada por la puerta lateral",
    talks: [{ title: "Rust en producción", speaker: "Ana" }],
    materials: [{ kind: "slides", title: "Slides", url: "https://example.com/slides" }],
    externalLinks: { meetup: "https://www.meetup.com/grupo/events/1" },
    venueId: venue.id,
    responders,
    ...evening(-7),
    rsvpClosesAt: new Date(evening(-7).startDate.getTime() - 3_600_000),
  });
  await db.insert(eventHosts).values({ eventId: event.id, communityId: other.id, status: "accepted" });
  await makeRsvp(event.id);

  return { event, venue, other };
}

describe("Repetir el último", () => {
  test("a copy keeps texts, sign-up, questions, hands, responders still on the team and channels", async () => {
    const { community, editor } = await team();
    const gone = await makeUser({ name: "Ya no está" });
    const { event } = await lastMonth(community.id, [editor.id, gone.id]);

    const copy = await call(router.events.createDraft, { communityId: community.id, copyFrom: event.id }, by(editor));

    expect(copy).toMatchObject({
      status: "draft",
      name: "Meetup de octubre",
      summary: "Tres charlas y pizza",
      format: "charlas",
      capacity: 50,
      questions: event.questions,
      volunteerRoles: ["puerta"],
      announcement: { channels: ["slack"] },
      reminderNote: "Entrada por la puerta lateral",
      responders: [editor.id],
    });
    expect(copy.id).not.toBe(event.id);
  });

  test("never people, talks, materials, publications, the space or the co-hosts (those are only offered)", async () => {
    const { community, editor } = await team();
    const { event, venue, other } = await lastMonth(community.id, []);

    const copy = await call(router.events.createDraft, { communityId: community.id, copyFrom: event.id }, by(editor));
    const people = await db.select().from(attendees).where(eq(attendees.eventId, copy.id));

    expect([copy.talks, copy.materials, copy.externalLinks, copy.venueId, copy.cohosts]).toStrictEqual([
      [],
      [],
      {},
      null,
      [],
    ]);
    expect(people).toStrictEqual([]);
    expect(copy.copiedFrom).toStrictEqual({
      id: event.id,
      name: event.name,
      venue: { id: venue.id, name: venue.name },
      cohosts: [{ id: other.id, name: other.name }],
    });
  });

  test("it lands on the same weekday and time about four weeks later, held like the calendar would", async () => {
    const { community, editor } = await team();
    const { event } = await lastMonth(community.id, []);

    const copy = await call(router.events.createDraft, { communityId: community.id, copyFrom: event.id }, by(editor));
    const days = (Date.parse(copy.startDate) - event.startDate.getTime()) / DAY_MS;

    expect(copy.dateChosen).toBe(true);
    expect(weekdayOf(dayKey(copy.startDate))).toBe(weekdayOf(dayKey(event.startDate)));
    expect(clockTime(copy.startDate)).toBe("19:00");
    expect([21, 28, 35]).toContain(Math.round(days));
  });

  test("dated texts, talks, the close time and the note read «Revisá» until edited", async () => {
    const { community, editor } = await team();
    const { event } = await lastMonth(community.id, []);

    const copy = await call(router.events.createDraft, { communityId: community.id, copyFrom: event.id }, by(editor));
    const saved = await call(
      router.events.save,
      {
        communityId: community.id,
        eventId: copy.id,
        expectedUpdatedAt: copy.updatedAt,
        patch: { name: "Meetup de noviembre", reviewed: ["reminderNote"] },
      },
      by(editor)
    );

    expect(copy.staleFields).toStrictEqual(["name", "talks", "rsvpClosesAt", "reminderNote"]);
    expect(saved.staleFields).toStrictEqual(["talks", "rsvpClosesAt"]);
    // Publishing lists what's left as a suggestion, never as a blocker
    expect(issues(saved).filter((issue) => issue.text.startsWith("Revisá"))).toStrictEqual([
      { step: "datos", text: "Revisá las charlas: viene del evento anterior", level: "recommended" },
      { step: "inscripcion", text: "Revisá el cierre de inscripción: viene del evento anterior", level: "recommended" },
    ]);
  });

  test("past the hold cap the copy is made without a date, and says so in its history", async () => {
    const { community, editor } = await team();
    const { event } = await lastMonth(community.id, []);
    for (let index = 0; index < 8; index++) {
      await makeEvent(community.id, {
        status: "draft",
        heldUntil: new Date(Date.now() + 5 * DAY_MS),
        ...evening(40 + index),
      });
    }

    const copy = await call(router.events.createDraft, { communityId: community.id, copyFrom: event.id }, by(editor));

    expect(copy).toMatchObject({ status: "draft", dateChosen: false, heldUntil: null });
  });

  test("nextDate proposes the day «Repetir» would take, from the last published event", async () => {
    const { community, editor } = await team();
    const { event } = await lastMonth(community.id, []);

    const next = await call(router.events.nextDate, { communityId: community.id }, by(editor));

    expect(next).toMatchObject({ source: { id: event.id, name: event.name }, startTime: "19:00", durationMin: 120 });
    expect(["libre", "cuidado", "choca"]).toContain(next?.level);
  });
});

describe("task templates", () => {
  test("applying a template twice adds its tasks once, owned by whoever created the event", async () => {
    const { community, editor, ref } = await team();
    const event = await makeEvent(community.id, { status: "draft", ...evening(40) });

    await call(router.events.applyTemplate, { ...ref(event.id), template: "charlas" }, by(editor));
    const again = await call(router.events.applyTemplate, { ...ref(event.id), template: "charlas" }, by(editor));

    expect(again.tasks).toHaveLength(8);
    expect(again.tasks.every((task) => task.assignees[0]?.userId === editor.id)).toBe(true);
    await expect(
      call(router.events.applyTemplate, { ...ref(event.id), template: "social" }, by(editor))
    ).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "other_template" } });
  });

  test("moving a published event moves its pending tasks; done ones stay on their day", async () => {
    const { community, editor, ref } = await team();
    const event = await makeEvent(community.id, { status: "published", registration: "owu", ...evening(40) });
    const { tasks } = await call(router.events.applyTemplate, { ...ref(event.id), template: "charlas" }, by(editor));
    const food = tasks.find((task) => task.templateKey === "charlas:comida");
    const place = tasks.find((task) => task.templateKey === "charlas:lugar");
    await call(router.staffTasks.setStatus, { eventId: event.id, taskId: food?.id ?? "", status: "done" }, by(editor));
    const current = await call(router.events.get, ref(event.id), by(editor));

    await call(
      router.events.save,
      {
        ...ref(event.id),
        expectedUpdatedAt: current.updatedAt,
        patch: { schedule: { day: addDays(dayKey(event.startDate), 7), startTime: "19:00", durationMin: 120 } },
      },
      by(editor)
    );
    const after = await call(router.events.tasks, ref(event.id), by(editor));
    const day = (key: string) => after.tasks.find((task) => task.templateKey === key)?.dayDate;

    expect([day("charlas:lugar"), day("charlas:comida")]).toStrictEqual([
      addDays(place?.dayDate ?? "", 7),
      food?.dayDate,
    ]);
  });

  test("the nudge goes once per task, day and person, and never for a done task", async () => {
    const { community, editor, admin, ref } = await team();
    const event = await makeEvent(community.id, { status: "published", ...evening(10) });
    const today = taskDay(nudgeDay());
    const [due, done] = await db
      .insert(staffTasks)
      .values([
        { openSpaceId: event.id, title: "Encargar la comida", dayDate: today, templateKey: "charlas:comida" },
        {
          openSpaceId: event.id,
          title: "Juntar las slides",
          dayDate: today,
          templateKey: "charlas:slides",
          status: "done",
        },
      ])
      .returning();
    await db.insert(staffTaskAssignments).values([
      { taskId: due.id, userId: editor.id },
      { taskId: done.id, userId: admin.id },
    ]);

    await run(sendTaskNudges);
    await run(sendTaskNudges);
    const sent = await db
      .select({ to: emailDeliveries.to, subject: emailDeliveries.subject })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.kind, "task_due"));
    const ours = sent.filter((mail) => mail.to === editor.email || mail.to === admin.email);

    expect(ours).toStrictEqual([{ to: editor.email, subject: "Hoy toca: Encargar la comida" }]);
    expect((await call(router.events.tasks, ref(event.id), by(editor))).tasks).toHaveLength(2);
  });

  test("one person doing more than 70% of the last events' tasks shows the hint", async () => {
    const { community, editor, ref } = await team();
    const event = await makeEvent(community.id, { status: "published", ...evening(-3) });
    const { tasks } = await call(router.events.applyTemplate, { ...ref(event.id), template: "charlas" }, by(editor));
    for (const task of tasks.slice(0, 7)) {
      await call(router.staffTasks.setStatus, { eventId: event.id, taskId: task.id, status: "done" }, by(editor));
    }

    const after = await call(router.events.tasks, ref(event.id), by(editor));

    expect(after.load).toStrictEqual({ name: editor.name, share: 1 });
  });
});

describe("the close-out", () => {
  test("an editor closes it out (Inicio stops asking); a member can't", async () => {
    const { community, editor, member, ref } = await team();
    const event = await makeEvent(community.id, { name: "Ya pasó", status: "published", ...evening(-2) });

    await expect(call(router.events.closeOut, ref(event.id), by(member))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const closed = await call(router.events.closeOut, ref(event.id), by(editor));
    const summary = await call(router.panel.summary, { communityId: community.id }, by(editor));

    expect(closed.closedOutAt).not.toBeNull();
    expect(summary.closeOut).toStrictEqual([]);
  });

  test("an event that hasn't ended can't be closed out", async () => {
    const { community, editor, ref } = await team();
    const event = await makeEvent(community.id, { status: "published", ...evening(3) });

    await expect(call(router.events.closeOut, ref(event.id), by(editor))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "not_over" },
    });
  });

  test("«avisó que no venía» marks someone excused (admins); never someone who came in", async () => {
    const { community, admin, editor } = await team();
    const event = await makeEvent(community.id, { status: "published", registration: "owu", ...evening(-2) });
    const [absent, came] = await Promise.all([makeRsvp(event.id), makeRsvp(event.id, { checkedInAt: new Date() })]);
    const excuse = (attendeeId: string, actor = admin) =>
      call(router.attendees.excuse, { eventId: event.id, attendeeId, excused: true }, by(actor));

    await expect(excuse(absent.id)).resolves.toStrictEqual({ attendeeId: absent.id, excused: true });
    await expect(excuse(absent.id, editor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(excuse(came.id)).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "checked_in" } });
    const [row] = await db
      .select({ excusedAt: attendees.excusedAt })
      .from(attendees)
      .where(eq(attendees.id, absent.id));
    expect(row.excusedAt).not.toBeNull();
  });
});

describe("volunteers", () => {
  test("a job is one email however often it's given; thanks go once, only to those who came", async () => {
    const { community, admin, ref } = await team();
    const event = await makeEvent(community.id, { name: "Noche con ayuda", status: "published", ...evening(-1) });
    const [helper, absent] = await Promise.all([
      makeRsvp(event.id, { volunteerRoles: ["puerta"], checkedInAt: new Date() }),
      makeRsvp(event.id, { volunteerRoles: ["fotos"] }),
    ]);
    const give = (attendeeId: string, role: "puerta" | "fotos") =>
      call(router.events.assignVolunteer, { ...ref(event.id), attendeeId, role }, by(admin));

    await give(helper.id, "puerta");
    const again = await give(helper.id, "puerta");
    await give(absent.id, "fotos");
    await call(router.events.thankVolunteers, ref(event.id), by(admin));
    await call(router.events.thankVolunteers, ref(event.id), by(admin));
    const mails = await db
      .select({ to: emailDeliveries.to, kind: emailDeliveries.kind })
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.to, helper.email)));

    expect(again).toMatchObject({ assigned: "puerta", offered: ["puerta"], checkedIn: true });
    expect(mails.map((mail) => mail.kind).toSorted()).toStrictEqual(["volunteer_role", "volunteer_thanks"]);
    expect(
      (await db.select().from(emailDeliveries).where(eq(emailDeliveries.to, absent.email))).map((mail) => mail.kind)
    ).toStrictEqual(["volunteer_role"]);
  });

  test("only admins see who offered a hand", async () => {
    const { community, editor, ref } = await team();
    const event = await makeEvent(community.id, { status: "published", ...evening(5) });

    await expect(call(router.events.volunteers, ref(event.id), by(editor))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the agenda", () => {
  test("generating one from the talks never touches another event's guion, and refuses one made at the desk", async () => {
    const { community, editor, ref } = await team();
    const meetup = await makeEvent(community.id, {
      status: "published",
      talks: [{ title: "Rust en producción", speaker: "Ana" }],
      ...evening(5),
    });
    const conf = await makeEvent(community.id, { status: "published", ...evening(6) });
    await db.insert(runOfShowItems).values({
      eventId: conf.id,
      title: "Keynote",
      plannedStart: "10:00",
      owyMessage: "Arranca la keynote",
    });

    const agenda = await call(router.events.generateAgenda, ref(meetup.id), by(editor));
    const deskItems = await db.select().from(runOfShowItems).where(eq(runOfShowItems.eventId, conf.id));

    expect(agenda.moments.map((moment) => [moment.plannedStart, moment.title])).toStrictEqual([
      ["19:00", "Puertas abiertas y networking"],
      ["19:30", "Bienvenida"],
      ["19:35", "Rust en producción · Ana"],
      ["19:55", "Networking y cierre"],
    ]);
    expect(deskItems.map((item) => item.title)).toStrictEqual(["Keynote"]);
    await expect(call(router.events.generateAgenda, ref(conf.id), by(editor))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "desk_rundown" },
    });
    // Its GO puts scenes on air and posts to Telegram: the stage desk's, never MC mode's
    await expect(call(router.events.agendaGo, ref(conf.id), by(editor))).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "desk_rundown" },
    });
  });

  test("saving reorders and resizes; MC's Siguiente starts the next moment", async () => {
    const { community, editor, ref } = await team();
    const meetup = await makeEvent(community.id, { status: "published", ...evening(0) });
    const { moments } = await call(router.events.generateAgenda, ref(meetup.id), by(editor));

    const saved = await call(
      router.events.saveAgenda,
      {
        ...ref(meetup.id),
        items: [moments[1], moments[0], moments[2]].map((moment, index) => ({
          id: moment.id,
          title: moment.title,
          durationMin: index === 0 ? 10 : moment.durationMin,
        })),
      },
      by(editor)
    );
    const live = await call(router.events.agendaGo, ref(meetup.id), by(editor));

    expect(saved.moments.map((moment) => [moment.plannedStart, moment.title])).toStrictEqual([
      ["19:00", "Bienvenida"],
      ["19:10", "Puertas abiertas y networking"],
      ["19:40", "Networking y cierre"],
    ]);
    expect(live.moments[0].actualStart).not.toBeNull();
  });
});

describe("the welcome slides", () => {
  test("the wifi is for organizers: the slides and the wizard have it, the public page never", async () => {
    const { community, editor, member, ref } = await team();
    const event = await makeEvent(community.id, {
      status: "published",
      responders: [editor.id],
      slideNotes: { wifiName: "OWU-Invitados", wifiPassword: "secreta123" },
      ...evening(3),
    });

    const slides = await call(router.events.slides, ref(event.id), by(editor));
    const page = await call(router.events.public, { communitySlug: community.slug, eventSlug: event.slug }, by(null));

    expect(slides.notes).toStrictEqual({ wifiName: "OWU-Invitados", wifiPassword: "secreta123" });
    expect(slides.responders).toHaveLength(1);
    expect(JSON.stringify(page)).not.toContain("secreta123");
    await expect(call(router.events.slides, ref(event.id), by(member))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
