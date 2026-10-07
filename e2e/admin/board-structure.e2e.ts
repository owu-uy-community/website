import type { Page } from "@playwright/test";

import { makeTrack } from "../../src/test/factories";
import { expect, test } from "../fixtures";

const grid = (screen: Page) => screen.getByRole("region", { name: "Grilla de charlas" });

test("a deleted talk comes back with Deshacer", async ({ page, board }) => {
  await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id },
    { title: "Volveré" }
  );
  await page.goto(board.url);

  await grid(page).getByText("Volveré", { exact: true }).click();
  await page.getByRole("button", { name: "Eliminar charla" }).click();
  await expect(grid(page).getByText("Volveré", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(grid(page).getByText("Volveré", { exact: true })).toBeVisible();
  await page.reload();
  await expect(grid(page).getByText("Volveré", { exact: true })).toBeVisible();
});

test("deleting a room that holds talks says how many go with it", async ({ page, board }) => {
  const where = { eventId: board.event.id, roomId: board.rooms.plain.id };
  await makeTrack({ ...where, scheduleId: board.slots.early.id }, { title: "Uno" });
  await makeTrack({ ...where, scheduleId: board.slots.late.id }, { title: "Dos" });
  await page.goto(board.url);

  await page.getByRole("button", { name: "Salas y horarios" }).click();
  await page.getByRole("button", { name: `Eliminar ${board.rooms.plain.name}` }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Las 2 charlas de esta sala también se eliminan");
  await page.getByRole("button", { name: "Eliminar sala" }).click();

  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.getByRole("button", { name: `Editar ${board.rooms.plain.name}` })).toBeHidden();
  await page.reload();
  await expect(grid(page).getByText(board.rooms.plain.name, { exact: true })).toBeHidden();
  await expect(grid(page).getByText("Uno", { exact: true })).toBeHidden();
});

test("rooms reordered from the panel keep their new order", async ({ page, board }) => {
  await page.goto(board.url);
  const x = async (name: string) => (await grid(page).getByText(name, { exact: true }).boundingBox())!.x;
  expect(await x(board.rooms.plain.name)).toBeLessThan(await x(board.rooms.tv.name));

  await page.getByRole("button", { name: "Salas y horarios" }).click();
  const saved = page.waitForResponse("**/api/orpc/rooms/reorder");
  await page.getByRole("button", { name: `Mover ${board.rooms.tv.name}` }).press("ArrowUp");
  await saved;

  await page.reload();
  expect(await x(board.rooms.tv.name)).toBeLessThan(await x(board.rooms.plain.name));
});

test("a room switched off leaves the kiosk but stays, dimmed, on the board", async ({ page, pageAs, board }) => {
  await page.goto(board.url);
  await page.getByRole("button", { name: "Salas y horarios" }).click();
  const saved = page.waitForResponse("**/api/orpc/rooms/update");
  await page.getByRole("switch", { name: `${board.rooms.tv.name} activa` }).click();
  await saved;
  await page.keyboard.press("Escape");

  await expect(grid(page).getByText(board.rooms.tv.name, { exact: true })).toBeVisible();
  await expect(grid(page).getByText("Inactiva", { exact: true })).toBeVisible();

  const kiosk = await pageAs("anonymous");
  await kiosk.goto(`/comunidad/${board.community.slug}/events/${board.event.slug}/kiosk`);
  await expect(kiosk.getByText(board.rooms.plain.name, { exact: true })).toBeVisible();
  await expect(kiosk.getByText(board.rooms.tv.name, { exact: true })).toBeHidden();
});

test("a room added on one screen shows up on the others without a reload", async ({ page, pageAs, board }) => {
  const other = await pageAs("admin");
  await Promise.all([page.goto(board.url), other.goto(board.url)]);
  // Listening: the board's live channel is open (the sidebar has an "En vivo" section too).
  await expect(other.getByRole("main").getByText("En vivo", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Salas y horarios" }).click();
  await page.getByRole("button", { name: "Nueva sala" }).click();
  await page.getByLabel("Nombre").fill("Patio");
  await page.getByRole("button", { name: "Crear sala" }).click();

  await expect(grid(other).getByText("Patio", { exact: true })).toBeVisible();
});
