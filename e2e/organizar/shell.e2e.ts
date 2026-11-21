import type { Page } from "@playwright/test";

import { makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, failNext, makeOrganizer, makePublishedEvent } from "./kit";

/** `navigator.platform` decides ⌘ or Ctrl: pretend to be a Mac or a Linux box. */
const onPlatform = (page: Page, platform: "MacIntel" | "Linux x86_64") =>
  page.addInitScript((value) => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => value });
  }, platform);

/** Shortcuts register once the page hydrates: press until it reacts. */
async function pressUntil(page: Page, keys: string[], done: () => Promise<void>) {
  await expect(async () => {
    for (const key of keys) await page.keyboard.press(key);
    await done();
  }).toPass({ timeout: 30_000 });
}

test("⌘K on a Mac and Ctrl+K on Linux open the palette, and it knows the words people use", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  const event = await makePublishedEvent(community.id, { name: "Meetup de la paleta" });

  const mac = await pageFor(organizer);
  await onPlatform(mac, "MacIntel");
  await mac.goto(panel);
  const palette = mac.getByRole("dialog", { name: "Buscar o ejecutar" });
  await pressUntil(mac, ["Meta+k"], () => expect(palette).toBeVisible({ timeout: 1000 }));
  const search = palette.getByRole("combobox");
  // The next event's actions come with the event list
  await search.fill("puerta");
  await expect(palette.getByRole("option", { name: /Abrir la puerta/ })).toBeVisible({ timeout: 30_000 });

  for (const [words, action] of [
    ["puerta", "Abrir la puerta"],
    ["check-in", "Abrir la puerta"],
    ["escaner", "Abrir la puerta"],
    ["inscriptos", "Ver los anotados"],
    ["venue", "Espacios"],
    ["charla", "Charlas"],
    ["encuesta de fecha", "Votar fecha"],
  ] as const) {
    await search.fill(words);
    await expect(palette.getByRole("option", { selected: true })).toContainText(action);
  }
  await search.fill("inscriptos");
  await mac.keyboard.press("Enter");
  await expect(mac).toHaveURL(new RegExp(`${panel}/eventos/${event.id}\\?tab=inscriptos`));

  // What was run last is first when the palette opens again
  await mac.keyboard.press("Meta+k");
  await expect(palette.getByRole("group", { name: "Recientes" })).toContainText("Ver los anotados");
  await mac.keyboard.press("Escape");
  await expect(mac.getByRole("button", { name: /Buscar o ejecutar/ }).getByText("⌘")).toBeVisible();

  const linux = await pageFor(organizer);
  await onPlatform(linux, "Linux x86_64");
  await linux.goto(panel);
  await pressUntil(linux, ["Control+k"], () =>
    expect(linux.getByRole("dialog", { name: "Buscar o ejecutar" })).toBeVisible({ timeout: 1000 })
  );
  await linux.keyboard.press("Escape");
  await expect(linux.getByRole("button", { name: /Buscar o ejecutar/ }).getByText("Ctrl")).toBeVisible();
  await expect(linux.getByRole("button", { name: /Buscar o ejecutar/ }).getByText("⌘")).toHaveCount(0);
});

test("g c, c and ? work until single-key shortcuts are turned off, and typing never navigates", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer("admin");
  const page = await pageFor(organizer);
  await page.goto(panel);

  await pressUntil(page, ["g", "c"], () => expect(page).toHaveURL(`${panel}/calendario`, { timeout: 1000 }));
  await page.keyboard.press("c");
  await expect(page.getByRole("dialog", { name: "Nuevo evento" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Typing in a field is typing (then erased: an unsaved change would hold the reload below)
  await page.goto(`${panel}/perfil`);
  await page.getByLabel("Descripción").click();
  await page.keyboard.type("gc");
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(`${panel}/perfil`);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.getByLabel("Descripción").blur();

  await pressUntil(page, ["?"], () =>
    expect(page.getByRole("dialog", { name: "Atajos de teclado" })).toBeVisible({ timeout: 1000 })
  );
  const sheet = page.getByRole("dialog", { name: "Atajos de teclado" });
  await sheet.getByRole("switch", { name: "Atajos de una tecla" }).click();
  await expect(sheet.getByRole("switch", { name: "Atajos de una tecla" })).not.toBeChecked();
  await page.keyboard.press("Escape");

  // Off, and still off after a reload: letters do nothing, ⌘K/Ctrl+K still opens the palette
  await page.reload();
  await pressUntil(page, ["ControlOrMeta+k"], () =>
    expect(page.getByRole("dialog", { name: "Buscar o ejecutar" })).toBeVisible({ timeout: 1000 })
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("c");
  await page.keyboard.press("?");
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(`${panel}/perfil`);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Back on from the user menu (by keyboard: in dev, Next's badge covers that corner)
  await page.getByRole("button", { name: /Organizadora de Prueba/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemcheckbox", { name: "Atajos de una tecla" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Atajos de una tecla" })).toBeChecked();
  await page.keyboard.press("Escape");
  await pressUntil(page, ["g", "c"], () => expect(page).toHaveURL(`${panel}/calendario`, { timeout: 1000 }));
});

test("the bell lists the same to-dos as Inicio, and each one goes where it's resolved", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer();
  await makePublishedEvent(community.id);
  const draft = await makeEvent(community.id, { name: "Borrador sin fecha", status: "draft" });

  const page = await pageFor(organizer);
  await page.goto(`${panel}/perfil`);
  // The count is the list's: what Inicio shows under "Para hacer"
  const bell = page.getByRole("button", { name: /^Para hacer: \d+$/ });
  await bell.click();
  const items = page.getByRole("dialog").getByRole("listitem");
  await expect(bell).toHaveAccessibleName(`Para hacer: ${await items.count()}`);
  await page.getByRole("dialog").getByRole("link", { name: "«Borrador sin fecha» no tiene fecha" }).click();
  await expect(page).toHaveURL(`${panel}/calendario?evento=${draft.id}`);
});

test("when the summary can't load, the bell and the sidebar say so and offer to retry", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer();
  const page = await pageFor(organizer);
  await failNext(page, "panel.summary");
  await page.goto(`${panel}/perfil`);

  const sidebar = page.locator("[data-sidebar=sidebar]").first();
  await expect(sidebar.getByText("No pudimos traer el próximo evento.")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await page.getByRole("button", { name: "Para hacer: no se pudo cargar" }).click();
  const popover = page.getByRole("dialog");
  await expect(popover.getByText("No pudimos traer lo pendiente")).toBeVisible();
  await expect(popover.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByText("Nada pendiente")).toHaveCount(0);

  // Once it loads again, so does the bell
  await page.unrouteAll();
  await popover.getByRole("button", { name: "Reintentar" }).click();
  await expect(popover.getByText("No pudimos traer lo pendiente")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Para hacer: (\d+|nada pendiente)$/ })).toBeVisible();
});

test("the panel's frame passes axe: header, sidebar, palette and shortcut sheet", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  await makePublishedEvent(community.id);
  const page = await pageFor(organizer);
  await page.goto(`${panel}/perfil`);
  await expect(page.getByRole("button", { name: /^Para hacer: (\d+|nada pendiente)$/ })).toBeVisible({
    timeout: 30_000,
  });

  // Colors mid fade-in aren't the colors: let dialogs settle before measuring contrast
  const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

  await expectAccessible(page, { include: "header" });
  await expectAccessible(page, { include: "[data-sidebar=sidebar]" });
  await pressUntil(page, ["?"], () =>
    expect(page.getByRole("dialog", { name: "Atajos de teclado" })).toBeVisible({ timeout: 1000 })
  );
  await settled();
  await expectAccessible(page, { include: "[role=dialog]" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "Buscar o ejecutar" })).toBeVisible();
  await settled();
  await expectAccessible(page, { include: "[role=dialog]" });
});
