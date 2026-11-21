import { makeAttendee } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { swipe } from "../touch";

test("on a phone a sideways swipe on the list moves between tabs, through the URL like a tap", async ({
  page,
  board,
}) => {
  await makeAttendee(board.event.id, { name: "María Pérez" });
  await makeAttendee(board.event.id, {
    name: "Lucía Sosa",
    checkedInAt: new Date(),
    checkinSource: "eventbrite",
    checkinDevice: "Escaneo",
  });
  await page.goto(`/admin/${board.community.slug}/attendees?event=${board.event.slug}`);
  const list = page.getByRole("tabpanel");
  await expect(list.getByText("María Pérez")).toBeVisible();

  await swipe(page, list, "left");
  await expect(page).toHaveURL(/[?&]estado=acreditados/);
  await expect(page.getByRole("tab", { name: /Acreditados/ })).toHaveAttribute("data-state", "active");
  await expect(list.getByText("Lucía Sosa")).toBeVisible();
  await expect(list.getByText("María Pérez")).toBeHidden();

  await swipe(page, list, "left");
  await expect(page).toHaveURL(/[?&]estado=por-llegar/);
  await expect(list.getByText("María Pérez")).toBeVisible();

  // Back to the first tab: the default leaves the URL, as tapping «Todos» does.
  await swipe(page, list, "right");
  await swipe(page, list, "right");
  await expect(page.getByRole("tab", { name: /Todos/ })).toHaveAttribute("data-state", "active");
  await expect(page).not.toHaveURL(/estado=/);

  // A swipe on the search field belongs to the field.
  await swipe(page, page.getByLabel("Buscar asistentes"), "left");
  await expect(page.getByRole("tab", { name: /Todos/ })).toHaveAttribute("data-state", "active");
});
