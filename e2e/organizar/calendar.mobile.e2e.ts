import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("on a phone the filters fold into a sheet, and a day's sheet keeps «Reservar» in view without the keyboard", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: `Teléfono ${createId().slice(0, 6)}` });
  const page = await pageFor(await makeMember(community.id, "editor"));

  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-03`);
  // The controls and the legend wait in «Filtros»
  await expect(page.getByLabel("Hora de inicio")).toHaveCount(0);
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const filters = page.getByRole("dialog", { name: "Filtros" });
  await expect(filters.getByLabel("Hora de inicio")).toBeVisible();
  await expect(page.locator("input:focus")).toHaveCount(0);
  await expect(filters.getByRole("button", { name: "Feriados" })).toHaveAttribute("aria-pressed", "true");
  await expect(filters.getByText("Borde rojo: el día choca")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-03&dia=2029-03-14`);
  const day = page.getByRole("dialog", { name: /miércoles 14 de marzo/ });
  await expect(day).toBeVisible();
  // Nothing typed into on open: the keyboard would cover the button
  await expect(page.locator("input:focus, textarea:focus")).toHaveCount(0);
  await expect(day.getByRole("button", { name: /^Reservar/ })).toBeInViewport();
});
