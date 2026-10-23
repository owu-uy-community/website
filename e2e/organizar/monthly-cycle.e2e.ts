import { createId } from "@paralleldrive/cuid2";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { attendees, events, surveys } from "../../src/lib/db/schema";
import { makeEvent, makeVenue } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, HOUR, lastEmailTo, makeOrganizer, makeRegistrations, runTick } from "./kit";

const move = (eventId: string, startsIn: number, hours = 2) =>
  db
    .update(events)
    .set({ startDate: new Date(Date.now() + startsIn), endDate: new Date(Date.now() + startsIn + hours * HOUR) })
    .where(eq(events.id, eventId));

// §5.3 of the testing plan: the month of a meetup, from "Repetir el último" to repeating it again
test("the monthly cycle: repeat the last one, publish, confirm, the day, close it out, repeat", async ({ pageFor }) => {
  test.slow();
  const { community, organizer, panel } = await makeOrganizer("admin");
  const venue = await makeVenue({ name: `Sala del ciclo ${createId().slice(0, 6)}` });
  await makeEvent(community.id, {
    name: "Meetup de octubre",
    summary: "Charlas cortas y pizza",
    status: "published",
    publishedAt: new Date(),
    registration: "owu",
    capacity: 40,
    format: "charlas",
    talks: [{ title: "Rust desde Python", speaker: "Caro P." }],
    reminderNote: "Entrada por la puerta lateral",
    volunteerRoles: ["puerta"],
    responders: [organizer.id],
    startDate: new Date(Date.now() - 10 * DAY),
    endDate: new Date(Date.now() - 10 * DAY + 2 * HOUR),
    closedOutAt: new Date(),
  });
  const page = await pageFor(organizer);

  // 1. Repetir el último → «Revisá» on what carries the old date → fix → publish
  await page.goto(`${panel}/eventos?nuevo=1`);
  await page.getByRole("button", { name: /Repetir «Meetup de octubre»/ }).click();
  await page.waitForURL(/\/editar/);
  const eventId = /eventos\/([^/]+)\/editar/.exec(page.url())?.[1] ?? "";
  await page.goto(`${panel}/eventos/${eventId}/editar?paso=datos`);
  await expect(page.getByLabel(/^Nombre/)).toHaveValue("Meetup de octubre");
  await expect(page.getByText("Revisá", { exact: true }).first()).toBeVisible();
  await expectAccessible(page, { include: "main" });
  const renamed = page.waitForResponse((response) => response.url().includes("/events/save") && response.ok());
  await page.getByLabel(/^Nombre/).fill("Meetup de noviembre");
  await renamed;
  const reviewed = page.waitForResponse((response) => response.url().includes("/events/save") && response.ok());
  await page.getByRole("button", { name: "Esta vez no hay charlas" }).click();
  await reviewed;
  await page
    .getByRole("button", { name: /Revisar/ })
    .first()
    .click();
  await expect(page.getByText("Revisá la nota del recordatorio: viene del evento anterior")).toBeVisible();
  await expect(page.getByText("Falta", { exact: true })).toHaveCount(0);
  await expectAccessible(page, { include: "main" });
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await page.getByRole("link", { name: "Abrir el tablero" }).click();
  await expect(page).toHaveURL(`${panel}/eventos/${eventId}`);

  // 2. People sign up; one offers a hand and gets the door
  const people = await makeRegistrations(eventId, 10, { registeredAt: new Date(Date.now() - 5 * DAY) });
  await db
    .update(attendees)
    .set({ volunteerRoles: ["puerta"] })
    .where(eq(attendees.id, people[0].id));
  await page.reload();
  await page.getByRole("combobox", { name: `Qué le toca a ${people[0].name}` }).click();
  await page.getByRole("option", { name: "Puerta" }).click();
  await page.getByRole("button", { name: "Avisarle" }).click();
  await lastEmailTo(page.request, people[0].email, "Te toca puerta");
  await expectAccessible(page, { include: "main" });

  // 3. Two days before: the confirm-or-release wave, then «Cuántos esperamos» counts who said «Voy»
  await move(eventId, 47 * HOUR);
  await runTick(page.request);
  await lastEmailTo(page.request, people[1].email, "Pasado mañana");
  await db
    .update(attendees)
    .set({ confirmedAt: new Date() })
    .where(
      inArray(
        attendees.id,
        people.slice(0, 6).map((person) => person.id)
      )
    );
  await page.reload();
  await expect(page.getByTestId("summary-stats")).toContainText("6/10");
  await expect(page.getByText(/los 6 que confirmaron cuentan casi enteros/)).toBeVisible();

  // 4. 59 minutes before, the day begins: the door is the one yellow button
  await move(eventId, 59 * 60_000);
  await page.reload();
  const door = page.getByRole("link", { name: "Abrir la puerta" });
  await expect(door).toBeVisible();
  await expect(door).toHaveClass(/bg-primary/);
  await expectAccessible(page, { include: "main" });
  await page.getByRole("button", { name: "Compartir link de la puerta" }).click();
  await page.getByRole("button", { name: "Crear el link" }).click();
  const link = (
    (await page
      .getByText(/\/puerta\//)
      .first()
      .textContent()) ?? ""
  ).trim();
  const volunteer = await page
    .context()
    .browser()!
    .newPage({ storageState: { cookies: [], origins: [] } });
  await volunteer.goto(link);
  await volunteer.getByRole("button", { name: "Código" }).click();
  await volunteer.getByPlaceholder("Código de la entrada").fill(people[1].barcode ?? "");
  await volunteer.getByPlaceholder("Código de la entrada").press("Enter");
  await expect(volunteer.getByText(/Adelante/)).toBeVisible();
  await volunteer.close();
  await db
    .update(attendees)
    .set({ checkedInAt: new Date(), checkinSource: "owu" })
    .where(
      inArray(
        attendees.id,
        people.slice(2, 7).map((person) => person.id)
      )
    );

  // 5. After: the close-out (one told the team, the survey, the space's recap) and the next one
  await move(eventId, -5 * HOUR);
  await db.update(events).set({ venueId: venue.id }).where(eq(events.id, eventId));
  await db.insert(surveys).values({ eventId, title: "¿Qué te pareció?", isOpen: false });
  await page.goto(`${panel}/eventos/${eventId}`);
  await expect(page.getByText("Entraron 6 de 10 personas con lugar.")).toBeVisible();
  const excused = page.getByRole("switch", { name: `${people[8].name} avisó que no venía` });
  await excused.click();
  await expect(excused).toBeChecked();
  await page.getByRole("switch", { name: "Encuesta abierta" }).click();
  await expect(page.getByRole("switch", { name: "Encuesta abierta" })).toBeChecked();
  await page.getByRole("button", { name: "Mandar el resumen al espacio" }).click();
  const recap = page.getByRole("dialog", { name: `Resumen para ${venue.name}` });
  await expect(recap.getByText("Vinieron")).toBeVisible();
  await page.keyboard.press("Escape");
  await expectAccessible(page, { include: "main" });
  await page.getByRole("button", { name: "Terminar el cierre" }).click();
  await expect(page.getByText(/^Cerrado el/)).toBeVisible();
  await expect
    .poll(async () => (await db.select().from(events).where(eq(events.id, eventId)))[0]?.closedOutAt !== null)
    .toBe(true);
  await page.getByRole("button", { name: "Repetir el mes que viene" }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/editar") && !url.pathname.includes(eventId));

  await page.goto(panel);
  await expect(page.getByRole("region", { name: "Para hacer" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/Cerrá «Meetup de noviembre»/)).toHaveCount(0);
});
