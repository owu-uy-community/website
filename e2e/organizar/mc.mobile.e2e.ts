import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { runOfShowItems } from "../../src/lib/db/schema";
import { clockTime } from "../../src/lib/community/time";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer, makePublishedEvent } from "./kit";

test("MC mode on a phone: the countdown, +5 min and Siguiente", async ({ pageFor }) => {
  const { community, panel } = await makeOrganizer();
  const editor = await makeMember(community.id, "editor");
  // Started ten minutes ago: the welcome is on, a talk comes next
  const event = await makePublishedEvent(community.id, { startsIn: -10 * 60_000 });
  const start = clockTime(event.startDate);
  await db.insert(runOfShowItems).values([
    {
      eventId: event.id,
      position: 0,
      title: "Bienvenida",
      plannedStart: start,
      durationMin: 15,
      actualStart: new Date(Date.now() - 2 * 60_000),
    },
    { eventId: event.id, position: 1, title: "Rust desde Python · Caro P.", plannedStart: start, durationMin: 20 },
  ]);
  const page = await pageFor(editor);

  await page.goto(`${panel}/eventos/${event.id}/mc`);
  await expect(page.getByTestId("mc-current")).toHaveText("Bienvenida");
  await expect(page.getByTestId("mc-countdown")).toHaveText(/^1[23]:\d\d$/);
  await expect(page.getByTestId("mc-next")).toHaveText("Rust desde Python · Caro P.");
  await expectAccessible(page);

  const longer = page.waitForResponse((response) => response.url().includes("/events/saveAgenda") && response.ok());
  await page.getByRole("button", { name: "5 min" }).click();
  await longer;
  await expect(page.getByTestId("mc-countdown")).toHaveText(/^1[78]:\d\d$/);

  const next = page.waitForResponse((response) => response.url().includes("/events/agendaGo") && response.ok());
  await page.getByRole("button", { name: "Siguiente" }).click();
  await next;
  await expect(page.getByTestId("mc-current")).toHaveText("Rust desde Python · Caro P.");
  await expect(page.getByTestId("mc-countdown")).toHaveText(/^(20:00|19:5\d)$/);
  const items = await db.select().from(runOfShowItems).where(eq(runOfShowItems.eventId, event.id));
  expect(items.map((item) => [item.title, item.durationMin, item.actualEnd !== null])).toStrictEqual(
    expect.arrayContaining([
      ["Bienvenida", 20, true],
      ["Rust desde Python · Caro P.", 20, false],
    ])
  );
});
