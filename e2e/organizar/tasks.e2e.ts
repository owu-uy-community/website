import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { staffTasks } from "../../src/lib/db/schema";
import { nudgeDay } from "../../src/lib/organizar/task-templates";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, lastEmailTo, mailbox, makeOrganizer, makePublishedEvent, runTick } from "./kit";

test("tasks: the usual list, someone for each, ticked with undo, and a nudge on the day", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const other = await makeMember(community.id, "editor", { name: "Beto Tareas" });
  const event = await makePublishedEvent(community.id, { startsIn: 20 * DAY });
  const page = await pageFor(organizer);

  await page.goto(`${panel}/eventos/${event.id}`);
  await page.getByRole("button", { name: "Sumar 8 tareas" }).click();
  const list = page.getByRole("list", { name: "Tareas del equipo" });
  await expect(list.getByRole("listitem")).toHaveCount(8);
  await expectAccessible(page, { include: "main" });

  const owner = page.getByRole("combobox", { name: "Quién se encarga de «Encargar la comida»" });
  await expect(owner).toHaveText(organizer.name);
  await owner.click();
  await page.getByRole("option", { name: "Beto Tareas" }).click();
  await expect(owner).toHaveText("Beto Tareas");

  const place = page.getByRole("checkbox", { name: "Pedir el lugar: hecha" });
  await place.click();
  await expect(place).toBeChecked();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(place).not.toBeChecked();

  // Its day comes: Beto gets one email (the tick runs twice, the email goes once)
  await db
    .update(staffTasks)
    .set({ dayDate: new Date(`${nudgeDay()}T00:00:00.000Z`) })
    .where(and(eq(staffTasks.openSpaceId, event.id), eq(staffTasks.templateKey, "charlas:comida")));
  await runTick(page.request);
  await runTick(page.request);
  await lastEmailTo(page.request, other.email, "Hoy toca: Encargar la comida");

  const mails = await mailbox(page.request, other.email);
  expect(mails.filter((mail) => mail.subject === "Hoy toca: Encargar la comida")).toHaveLength(1);
});
