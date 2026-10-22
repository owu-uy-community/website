import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeEvent, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

// Against scripts/mock-eventbrite.mjs: its authorize page approves at once.
test("an admin connects Eventbrite, publishes an event there, and its page sends people to sign up on it", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: `Con Eventbrite ${createId().slice(0, 6)}` });
  const admin = await makeMember(community.id, "admin");
  const start = new Date(Date.now() + 20 * 86_400_000);
  const name = `Meetup en Eventbrite ${createId().slice(0, 6)}`;
  const event = await makeEvent(community.id, {
    name,
    summary: "Charlas y pizza",
    status: "draft",
    heldUntil: new Date(Date.now() + 7 * 86_400_000),
    registration: "eventbrite",
    capacity: 60,
    placeName: "Sala Uno",
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });

  const page = await pageFor(admin);
  await page.goto(`/organizar/panel/${community.slug}/integraciones`);
  await page.getByRole("link", { name: "Conectar Eventbrite" }).click();
  await expect(page.getByText("Eventbrite conectado")).toBeVisible();
  await expect(page.getByText("Cuenta de prueba en Eventbrite")).toBeVisible();

  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}/editar?paso=inscripcion`);
  await expect(page.getByText(/Al publicar lo creamos en Eventbrite/)).toBeVisible();
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}/editar?paso=revisar`);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("¡Publicado!")).toBeVisible();
  const path = await page.getByRole("dialog").getByRole("link", { name: "Ver la página" }).getAttribute("href");

  // Pushed right after the publish response: the dashboard links to it
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}`);
  await expect(page.getByRole("link", { name: "Ver en Eventbrite" })).toHaveAttribute("href", /127\.0\.0\.1:\d+\/e\//);

  await page.goto(path ?? "/");
  await page.getByRole("link", { name: "Inscribirme en Eventbrite" }).first().click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
