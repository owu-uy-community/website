import type { Page } from "@playwright/test";

import { makeTrack } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("a talk put on the board shows up on another screen at once", async ({ page, pageAs, board }) => {
  const other = await pageAs("admin");
  await Promise.all([page.goto(board.url), other.goto(board.url)]);
  await expect(other.getByRole("region", { name: "Grilla de charlas" })).toBeVisible();

  await page.getByRole("button", { name: "Charla", exact: true }).click();
  await page.getByLabel("Título").fill("Effect en producción");
  await page.getByRole("button", { name: "Guardar charla" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  // Once on each screen: the server's own broadcast must not add it twice where it was created.
  await expect(other.getByText("Effect en producción", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Effect en producción", { exact: true })).toHaveCount(1);
});

test("two talks dragged onto each other stay swapped on every screen", async ({ page, pageAs, board }) => {
  const where = { eventId: board.event.id, roomId: board.rooms.plain.id };
  const a = await makeTrack({ ...where, scheduleId: board.slots.early.id }, { title: "Arriba" });
  const b = await makeTrack({ ...where, scheduleId: board.slots.late.id }, { title: "Abajo" });
  const other = await pageAs("admin");
  await Promise.all([page.goto(board.url), other.goto(board.url)]);

  const card = (screen: Page, id: string) => screen.locator(`[data-note-id="${id}"]`);
  const from = (await card(page, a.id).boundingBox())!;
  const to = (await card(page, b.id).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  const swapped = page.waitForResponse("**/api/orpc/tracks/swap");
  await page.mouse.up();
  await swapped;

  // Barrier: a talk added afterwards reaching both screens means each one has
  // already applied whatever the swap broadcast before it.
  await other.getByRole("button", { name: `Agregar charla en ${board.rooms.tv.name}, 15:00 - 15:45` }).click();
  await other.getByLabel("Título").fill("Después");
  await other.getByRole("button", { name: "Guardar charla" }).click();
  await expect(page.getByText("Después", { exact: true })).toBeVisible();

  for (const screen of [page, other]) {
    const top = async (id: string) => (await card(screen, id).boundingBox())!.y;
    await expect.poll(async () => (await top(a.id)) > (await top(b.id))).toBe(true);
  }
});

test("a place that is already taken names the talk that has it", async ({ page, board }) => {
  await makeTrack(
    { eventId: board.event.id, scheduleId: board.slots.early.id, roomId: board.rooms.plain.id },
    { title: "Primera" }
  );
  await page.goto(board.url);

  // A new talk starts in the first room and slot: the taken one.
  await page.getByRole("button", { name: "Charla", exact: true }).click();
  await page.getByLabel("Título").fill("Segunda");
  await page.getByRole("button", { name: "Guardar charla" }).click();

  await expect(page.getByText('Este espacio ya está ocupado por "Primera"')).toBeVisible();
});
