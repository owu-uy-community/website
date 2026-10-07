import { expect, test } from "../fixtures";

test("on a phone the editors are bottom sheets that close with a swipe down", async ({ page, board }) => {
  await page.goto(board.url);

  await page.getByRole("button", { name: "Salas y horarios" }).click();
  await page.getByRole("tab", { name: /Horarios/ }).click();
  await page.getByRole("button", { name: "Editar 15:00 - 15:45" }).click();
  const sheet = page.getByRole("dialog", { name: "Editar horario" });
  await expect(sheet).toBeVisible();

  // A sheet rising from the bottom edge, not a panel from the top.
  const title = sheet.getByRole("heading", { name: "Editar horario" });
  const viewport = page.viewportSize()!;
  await expect.poll(async () => (await title.boundingBox())!.y).toBeGreaterThan(viewport.height / 4);

  // Swipe the header down: the slot editor goes, the manage sheet under it stays.
  const start = (await title.boundingBox())!;
  await page.mouse.move(start.x + 10, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 250, { steps: 12 });
  await page.mouse.up();

  await expect(sheet).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Salas y horarios" })).toBeVisible();
});
