import { expect, test } from "../fixtures";

test("⌘K: a page's name and Enter opens the page, never the scene with the same name", async ({ page, board }) => {
  await page.goto(`/admin/${board.community.slug}?event=${board.event.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Preparación" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Buscar o ejecutar" });
  await palette.getByRole("combobox").fill("agenda");
  // The scene "Agenda" matches too; the page has to be the one Enter runs.
  await expect(palette.getByRole("option", { name: /Agenda/ }).first()).toHaveAttribute("data-selected", "true");
  await expect(palette.getByRole("option", { selected: true })).toContainText("Planificar");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/admin/${board.community.slug}/openspace\\?event=${board.event.slug}`));
  // No "Al aire" toast: nothing went to the wall (the sidebar may say "al aire" for another test's scene).
  await expect(page.locator("[data-sonner-toast]", { hasText: "Al aire" })).toHaveCount(0);
});

test("⌘K: a room marked full can be reopened right away", async ({ page, board }) => {
  await page.goto(`/admin/${board.community.slug}?event=${board.event.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Preparación" })).toBeVisible();
  const palette = page.getByRole("dialog", { name: "Buscar o ejecutar" });
  const input = palette.getByRole("combobox");

  await page.keyboard.press("ControlOrMeta+k");
  await input.fill("llena");
  await page.keyboard.press("Enter");
  await expect(input).toHaveAttribute("placeholder", "¿Qué sala?");
  await palette.getByRole("option", { name: new RegExp(board.rooms.plain.name) }).click();
  await expect(page.getByText(`${board.rooms.plain.name}: llena`)).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await input.fill("reabrir");
  await page.keyboard.press("Enter");
  await palette.getByRole("option", { name: new RegExp(board.rooms.plain.name) }).click();
  await expect(page.getByText(`${board.rooms.plain.name}: abierta`)).toBeVisible();
});
