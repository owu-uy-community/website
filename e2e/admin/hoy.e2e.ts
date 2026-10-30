import { expect, test } from "../fixtures";

test("before the day, Hoy is the preparation: countdown, checklist and milestones", async ({ page, board }) => {
  await page.goto(`/admin/${board.community.slug}?event=${board.event.slug}`);

  await expect(page.getByRole("heading", { level: 1, name: "Preparación" })).toBeVisible();
  await expect(page.getByText("Cuenta regresiva")).toBeVisible();
  await expect(page.getByText("Próximos hitos")).toBeVisible();
  // The board factory has rooms and slots: that item is done, the run of show isn't.
  await expect(page.getByText("Salas y horarios definidos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Resolver" }).first()).toBeVisible();
});

test("the sidebar takes you to the event's pages and ⌘K runs from anywhere", async ({ page, board }) => {
  await page.goto(`/admin/${board.community.slug}?event=${board.event.slug}`);

  await page.getByRole("link", { name: "Agenda" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/${board.community.slug}/openspace\\?event=${board.event.slug}`));

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Buscá charlas, personas, escenas/).fill("Hoy");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/admin/${board.community.slug}\\?event=${board.event.slug}`));
  await expect(page.getByRole("heading", { level: 1, name: "Preparación" })).toBeVisible();
});
