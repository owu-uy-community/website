import { expect, test } from "../fixtures";

test("on a phone the board stops above the tab bar, so its last row can be reached", async ({ page, board }) => {
  await page.goto(board.url);
  const grid = page.getByRole("region", { name: "Grilla de charlas" });
  await expect(grid).toBeVisible();

  const bottom = (await grid.boundingBox())!;
  const tabs = (await page.getByRole("navigation", { name: "Secciones" }).boundingBox())!;
  expect(bottom.y + bottom.height).toBeLessThanOrEqual(tabs.y + 1);
});

test("on a phone the editors are bottom sheets that close with a swipe down", async ({ page, board }) => {
  await page.goto(board.url);

  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Salas y horarios" }).click();
  await page.getByRole("tab", { name: /Horarios/ }).click();
  await page.getByRole("button", { name: "Editar 15:00 - 15:45" }).click();
  const sheet = page.getByRole("dialog", { name: "Editar horario" });
  await expect(sheet).toBeVisible();

  // Let it finish sliding up before touching it: mid-animation the header isn't where it ends up.
  const title = sheet.getByRole("heading", { name: "Editar horario" });
  let lastY = Number.NaN;
  await expect
    .poll(
      async () => {
        const y = (await title.boundingBox())!.y;
        const settled = Math.abs(y - lastY) < 0.5;
        lastY = y;
        return settled;
      },
      { intervals: [100] }
    )
    .toBe(true);

  // A sheet resting on the bottom edge, not a panel from the top.
  expect(lastY).toBeGreaterThan(page.viewportSize()!.height / 4);

  // Swipe the header down: the slot editor goes, the manage sheet under it stays.
  const start = (await title.boundingBox())!;
  await page.mouse.move(start.x + 10, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 250, { steps: 12 });
  await page.mouse.up();

  await expect(sheet).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Salas y horarios" })).toBeVisible();
});
