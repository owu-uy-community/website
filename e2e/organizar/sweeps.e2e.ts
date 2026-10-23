import { makeCommunity } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { HOUR, lastEmailTo, makePublishedEvent, makeRegistrations, runTick } from "./kit";

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
