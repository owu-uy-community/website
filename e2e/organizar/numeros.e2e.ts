import { readFile } from "node:fs/promises";

import { makeRsvp } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

test("Números shows each number with its count, and the data downloads as CSV", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  // Two months ago 3 signed up and 2 came; last month those 2 came back with 2 new, 1 of whom came
  const older = await makePublishedEvent(community.id, { startsIn: -60 * DAY, name: "Meetup anterior" });
  const last = await makePublishedEvent(community.id, { startsIn: -30 * DAY, name: "Meetup pasado" });
  const regulars = await makeRegistrations(older.id, 3, { checkedIn: 2 });
  for (const person of regulars.slice(0, 2)) {
    await makeRsvp(last.id, { userId: person.userId, checkedInAt: new Date(), checkinSource: "owu" });
  }
  await makeRegistrations(last.id, 2, { checkedIn: 1 });

  const page = await pageFor(organizer);
  await page.goto(`${panel}/numeros`);
  await expect(page.getByRole("heading", { level: 1, name: "Números" })).toBeVisible();
  // It ended 2 hours after it started, 30 days ago
  await expect(page.getByRole("group", { name: "Último evento" })).toContainText("Hace 29 días");
  // Both who were new two months ago came back; 2 of the 3 who came lately had come before
  await expect(page.getByRole("group", { name: "Segunda visita" })).toContainText("2 de 2");
  await expect(page.getByRole("group", { name: "Vuelven" })).toContainText("2 de 3");
  const row = page.getByRole("row", { name: /Meetup pasado/ });
  await expect(row).toContainText("3 de 4");
  await expect(row).toContainText("1 de 3");
  // The panel's shell (sidebar, switcher) has its own axe specs
  await expectAccessible(page, { include: "main" });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Asistencia (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${community.slug}-asistencia-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain("Meetup pasado");
});

test("a new community's Números says what will show up; OWU's impact page reads well", async ({ pageFor, pageAs }) => {
  const { organizer, panel } = await makeOrganizer("editor");

  const page = await pageFor(organizer);
  await page.goto(`${panel}/numeros`);
  await expect(page.getByText("Todavía no hay números")).toBeVisible();
  // Editors see the numbers, not the export
  await expect(page.getByRole("button", { name: "Eventos (CSV)" })).toHaveCount(0);

  const visitor = await pageAs("anonymous");
  await visitor.goto("/comunidades");
  await visitor.getByRole("link", { name: "Los números de OWU" }).click();
  await expect(
    visitor.getByRole("heading", { level: 1, name: "Lo que mueve la comunidad tech de Uruguay" })
  ).toBeVisible();
  await expect(visitor.getByText("personas distintas vinieron").first()).toBeVisible();
  // The site header is the public chrome, checked by its own specs
  await expectAccessible(visitor, { include: "main" });
});
