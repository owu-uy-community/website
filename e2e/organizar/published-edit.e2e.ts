import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { emailDeliveries, events } from "../../src/lib/db/schema";
import { addDays } from "../../src/lib/calendar/holidays";
import { dayKey } from "../../src/lib/community/time";
import { longDay } from "../../src/lib/organizar/times";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, makeOrganizer, makePublishedEvent, makeRegistrations, runTick } from "./kit";

test("Editar on a published event opens Revisar; a new date says who hears, and each hears once", async ({
  pageFor,
}) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const event = await makePublishedEvent(community.id, { startsIn: 20 * DAY });
  const people = await makeRegistrations(event.id, 3);
  const page = await pageFor(organizer);

  await page.goto(`${panel}/eventos/${event.id}`);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Cómo está publicado" })).toBeVisible();
  await expect(page.getByTestId("published-banner")).toContainText("les avisamos a 3 personas");
  // Cancelling lives in Ajustes only
  await expect(page.getByRole("button", { name: /Cancelar evento/ })).toHaveCount(0);
  await expectAccessible(page, { include: "main" });

  await page.getByRole("button", { name: "Cambiar fecha" }).click();
  const target = addDays(dayKey(event.startDate), 1);
  if (target.slice(0, 7) !== dayKey(event.startDate).slice(0, 7)) {
    await page.getByRole("button", { name: "Mes siguiente" }).click();
  }
  await page
    .getByRole("group", { name: "Días del mes" })
    .getByRole("button", { name: new RegExp(`^${longDay(target).split(" ")[0]} ${Number(target.slice(8))} `) })
    .click();
  const moved = page.waitForResponse((response) => response.url().includes("/events/save") && response.ok());
  await page.getByRole("button", { name: "Mover el evento a este día" }).click();
  await moved;
  await expect(page.getByText("Les avisamos", { exact: true })).toBeVisible();
  await expect(page.getByTestId("published-banner")).toBeVisible();

  // Ten minutes after the last change, one email each, however many ticks run
  await db
    .update(events)
    .set({ updatedAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(events.id, event.id));
  await runTick(page.request);
  await runTick(page.request);
  const sent = await db
    .select({ to: emailDeliveries.to })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.kind, "rsvp_updated"),
        inArray(
          emailDeliveries.to,
          people.map((person) => person.email)
        )
      )
    );
  expect(sent.map((row) => row.to).toSorted()).toStrictEqual(people.map((person) => person.email).toSorted());
});
