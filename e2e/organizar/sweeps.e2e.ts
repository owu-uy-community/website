import { db } from "../../src/lib/db";
import { surveys } from "../../src/lib/db/schema";
import { makeCommunity } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { HOUR, lastEmailTo, linkIn, mailbox, makePublishedEvent, makeRegistrations, runTick } from "./kit";

// The tick (QStash every 5 minutes) finds what's due by time: events seeded relative to now are enough
test("the tick sends the two-day reminder once, to people who signed up more than 12 h before", async ({ request }) => {
  const community = await makeCommunity({ name: "Comunidad puntual" });
  const event = await makePublishedEvent(community.id, { startsIn: 40 * HOUR, reminderNote: "Traé tu cédula" });
  const [early] = await makeRegistrations(event.id, 1, { registeredAt: new Date(Date.now() - 3 * 24 * HOUR) });
  const [late] = await makeRegistrations(event.id, 1, { registeredAt: new Date(Date.now() - HOUR) });

  await runTick(request);
  const reminder = await lastEmailTo(request, early.email, `Pasado mañana: ${event.name}`);
  expect(reminder.text).toContain("Traé tu cédula");

  // A second tick sends nothing new, and late sign-ups never get the two-day reminder
  await runTick(request);
  const boxes = await Promise.all(
    [early.email, late.email].map(async (to) =>
      ((await (await request.get(`/api/dev/mailbox?to=${encodeURIComponent(to)}`)).json()) as { subject: string }[])
        .map((message) => message.subject)
        .filter((subject) => subject.startsWith("Pasado mañana"))
    )
  );
  expect(boxes.map((subjects) => subjects.length)).toStrictEqual([1, 0]);
});

test("the two-day reminder asks Voy or No puedo ir and lists other OWU events this week", async ({ request }) => {
  const community = await makeCommunity({ name: "Comunidad con agenda" });
  const event = await makePublishedEvent(community.id, { startsIn: 40 * HOUR });
  await makePublishedEvent(community.id, { startsIn: 100 * HOUR, name: "Otro meetup de la semana" });
  const [person] = await makeRegistrations(event.id, 1, { registeredAt: new Date(Date.now() - 3 * 24 * HOUR) });

  await runTick(request);
  const reminder = await lastEmailTo(request, person.email, `Pasado mañana: ${event.name}`);

  expect(linkIn(reminder, "accion=confirmar")).toContain(`/events/${event.slug}/entrada?t=`);
  expect(linkIn(reminder, "accion=liberar")).toContain(`/events/${event.slug}/entrada?t=`);
  expect(reminder.text).toContain("Otros eventos de OWU esta semana");
});

test("when the door was used, the survey goes only to the people who came", async ({ request }) => {
  const community = await makeCommunity({ name: "Comunidad con encuesta" });
  const event = await makePublishedEvent(community.id, { startsIn: -8 * HOUR, hours: 2 });
  await db.insert(surveys).values({ eventId: event.id, title: "¿Qué tal?", isOpen: true });
  const [came] = await makeRegistrations(event.id, 1, {
    checkedInAt: new Date(Date.now() - 7 * HOUR),
    checkinSource: "owu",
  });
  const [missed] = await makeRegistrations(event.id, 1);

  await runTick(request);
  await lastEmailTo(request, came.email, `¿Qué te pareció ${event.name}?`);

  expect((await mailbox(request, missed.email)).map((message) => message.subject)).not.toContain(
    `¿Qué te pareció ${event.name}?`
  );
});
