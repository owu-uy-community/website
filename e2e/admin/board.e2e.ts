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
