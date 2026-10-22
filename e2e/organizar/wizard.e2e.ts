import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("an organizer builds an event step by step and publishes it", async ({ pageFor }) => {
  const community = await makeCommunity({ name: `Asistente ${createId().slice(0, 6)}` });
  const organizer = await makeMember(community.id, "editor");
  const name = `Noche de charlas ${createId().slice(0, 6)}`;

  const page = await pageFor(organizer);
  await page.goto(`/organizar/panel/${community.slug}/eventos?nuevo=1`);
  await page.getByRole("button", { name: "Empezar de cero" }).click();
  await expect(page.getByRole("radiogroup", { name: "Formato" })).toBeVisible();

  await page.getByRole("radio", { name: /Charlas/ }).click();
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByLabel("Nombre").fill(name);
  const saved = page.waitForResponse((response) => response.url().includes("/events/save") && response.ok());
  await page.getByLabel("Resumen").fill("Tres charlas cortas y pizza");
  await saved;

  // Autosave survives a reload, and ?paso= opens the step
  await page.reload();
  await expect(page.getByLabel("Nombre")).toHaveValue(name);

  await page.getByRole("button", { name: /Fecha/ }).first().click();
  await page.getByText("Te sugerimos").locator("..").getByRole("button").first().click();
  await page.getByRole("button", { name: "Reservar esta fecha" }).click();
  await expect(page.getByText(/Reservaste el/)).toBeVisible();

  await page
    .getByRole("button", { name: /Revisar/ })
    .first()
    .click();
  // Only suggestions left (description, topics, place): nothing blocks publishing
  await expect(page.getByText("Sugerido").first()).toBeVisible();
  await expect(page.getByText("Falta", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("¡Publicado!")).toBeVisible();

  const link = await page.getByRole("dialog").getByRole("link", { name: "Ver la página" }).getAttribute("href");
  await page.goto(link ?? "/");
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}") as {
    startDate?: string;
  };
  expect(jsonLd.startDate).toBeTruthy();
});
