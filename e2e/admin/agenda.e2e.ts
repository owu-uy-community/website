import type { Page } from "@playwright/test";

import { makeTrack } from "../../src/test/factories";
import { expect, test } from "../fixtures";

const grid = (screen: Page) => screen.getByRole("region", { name: "Grilla de charlas" });
const list = (screen: Page) => screen.getByRole("region", { name: "Lista de charlas" });
const updated = (screen: Page) =>
  screen.waitForResponse((response) => response.url().includes("/api/orpc/tracks/update"));

test("the view sticks to the device, and the inspector moves a talk and logs it", async ({ page, board }) => {
  await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id },
    { title: "Mudanza" }
  );
  await page.goto(board.url);
  await expect(grid(page)).toBeVisible();

  // Post-it until someone picks another view; the pick survives a reload.
  await expect(page.getByRole("tab", { name: "Post-it" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Compacta" }).click();
  await expect(grid(page).getByRole("heading", { name: "Mudanza" })).toBeVisible();
  await page.getByRole("tab", { name: "Lista" }).click();
  await expect(list(page).getByRole("row", { name: /Mudanza/ })).toContainText(board.rooms.plain.name);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");

  // A row opens the talk beside the board; moving it there saves and lands in its history.
  await list(page).getByRole("button", { name: "Mudanza" }).click();
  const inspector = page.getByRole("complementary", { name: "Detalle de la charla" });
  await inspector.locator("#room").click();
  await page.getByRole("option", { name: board.rooms.tv.name }).click();
  const saved = updated(page);
  await inspector.getByRole("button", { name: "Guardar", exact: true }).click();
  await saved;

  await expect(list(page).getByRole("row", { name: /Mudanza/ })).toContainText(board.rooms.tv.name);
  await inspector.getByRole("tab", { name: "Cambios" }).click();
  await expect(inspector.getByText(`movió «Mudanza» a ${board.rooms.tv.name} · 15:00`)).toBeVisible();
});

test("Esc closes the open talk from inside a field, asking first when it has changes", async ({ page, board }) => {
  const talk = await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id },
    { title: "Escape" }
  );
  await page.goto(board.url);
  const card = page.locator(`[data-note-id="${talk.id}"]`);
  const inspector = page.getByRole("complementary", { name: "Detalle de la charla" });

  // The open post-it is outlined (its own shadow used to paint over the ring).
  await card.click();
  await expect(card.locator(":scope > div")).toHaveCSS("outline-style", "solid");

  await inspector.getByLabel("Título").focus();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();

  await card.click();
  await inspector.getByLabel("Orador (opcional)").fill("Alguien");
  await page.keyboard.press("Escape");
  await page
    .getByRole("alertdialog", { name: "¿Descartar los cambios?" })
    .getByRole("button", { name: "Descartar" })
    .click();
  await expect(inspector).toBeHidden();
});

test("a card moves from the keyboard, a cell per arrow, and says so", async ({ page, board }) => {
  const talk = await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id },
    { title: "Teclado" }
  );
  await page.goto(board.url);

  // Each key waits for what a screen reader hears, as a person would: the arrows only work once
  // the card is in hand.
  const heard = page.getByRole("status").filter({ hasText: "«Teclado»" });
  await page.locator(`[data-note-id="${talk.id}"]`).focus();
  await page.keyboard.press("Space");
  await expect(heard).toHaveText("Tomaste «Teclado».");
  // The drag starts listening for arrows in a task after the pick-up, so a key typed the same
  // instant is lost on a loaded machine. A person takes longer than this to press the next key.
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowRight");
  await expect(heard).toHaveText(`«Teclado» sobre ${board.rooms.tv.name}, 15:00 - 15:45.`);
  const saved = updated(page);
  await page.keyboard.press("Space");
  await saved;
  await expect(heard).toHaveText(`Soltaste «Teclado» en ${board.rooms.tv.name}, 15:00 - 15:45.`);

  await page.reload();
  await page.getByRole("tab", { name: "Lista" }).click();
  await expect(list(page).getByRole("row", { name: /Teclado/ })).toContainText(board.rooms.tv.name);
});
