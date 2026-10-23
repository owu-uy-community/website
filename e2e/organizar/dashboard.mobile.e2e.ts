import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer, makePublishedEvent } from "./kit";

test("on a phone the event's sections are Hoy · Personas · Más, every label whole", async ({ pageFor }) => {
  const { community, panel } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id);
  const page = await pageFor(admin);

  await page.goto(`${panel}/eventos/${event.id}`);
  const nav = page.getByRole("navigation", { name: "Secciones del evento" }).filter({ visible: true });
  await expect(nav.getByRole("button", { name: "Hoy" })).toHaveAttribute("aria-current", "page");
  await expectAccessible(page, { include: "main" });

  await nav.getByRole("button", { name: "Personas" }).click();
  await expect(page).toHaveURL(/tab=personas/);

  await nav.getByRole("button", { name: "Más" }).click();
  for (const section of ["Mensajes", "Difusión", "Después", "Ajustes"]) {
    await expect(page.getByRole("menuitem", { name: section })).toBeVisible();
  }
  await page.getByRole("menuitem", { name: "Ajustes" }).click();
  await expect(page).toHaveURL(/tab=ajustes/);
  // The menu's button says where you are
  await expect(nav.getByRole("button", { name: "Ajustes" })).toHaveAttribute("aria-current", "page");

  // Nothing cut: every label fits its button, and the row doesn't scroll sideways
  const cut = await nav
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.filter((button) => button.scrollWidth > button.clientWidth).map((button) => button.textContent)
    );
  expect(cut).toStrictEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
