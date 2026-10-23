import { makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { makeOrganizer, makePublishedEvent } from "./kit";

test("on a phone the tab bar has five slots, + starts an event and «Más» is the only menu button", async ({
  pageFor,
}) => {
  const { organizer, panel } = await makeOrganizer("admin");
  const page = await pageFor(organizer);
  await page.goto(panel);

  const tabs = page.getByRole("navigation", { name: "Secciones" });
  await expect(tabs.locator(":scope > div > *")).toHaveCount(5);
  for (const name of ["Inicio", "Calendario", "Eventos"]) await expect(tabs.getByRole("link", { name })).toBeVisible();
  // The header's menu button would open the same menu as «Más»
  await expect(page.getByRole("button", { name: "Mostrar u ocultar el menú" })).toBeHidden();
  // A focused field scrolls clear of the tab bar (WCAG 2.4.11)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe("57px");

  // A dispatched click: in dev the query devtools' button covers that corner
  await tabs.getByRole("button", { name: "Más" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Perfil" })).toBeVisible();
  await page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Perfil" }).click();
  await expect(page).toHaveURL(`${panel}/perfil`);

  await tabs.getByRole("button", { name: "Nuevo evento" }).click();
  await expect(page.getByRole("dialog", { name: "Nuevo evento" })).toBeVisible();
});

test("the wizard and the door scanner take the whole screen: no tab bar, the menu stays in the header", async ({
  pageFor,
}) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  const [draft, event] = await Promise.all([
    makeEvent(community.id, { name: "Borrador en el teléfono", status: "draft" }),
    makePublishedEvent(community.id),
  ]);
  const page = await pageFor(organizer);

  for (const path of [`eventos/${draft.id}/editar`, `eventos/${event.id}/puerta/escanear`]) {
    await page.goto(`${panel}/${path}`);
    await expect(page.getByRole("button", { name: "Mostrar u ocultar el menú" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Secciones" })).toHaveCount(0);
  }
});
