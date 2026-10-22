import { makeCommunity, makeEvent, makeMember, makeUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";

const PHONE = { width: 412, height: 915 };

test("on a phone the calendar opens as a list, and a day opens in a sheet", async ({ pageFor }) => {
  const community = await makeCommunity({ name: "Comunidad en el teléfono" });
  const organizer = await makeMember(community.id, "editor");
  const page = await pageFor(organizer);
  await page.setViewportSize(PHONE);

  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-03`);
  await expect(page.getByLabel("Agenda", { exact: true })).toHaveAttribute("data-state", "on");
  await page.getByRole("listitem").getByRole("button", { name: /mar/i }).first().click();

  await expect(page.getByRole("dialog", { name: /de marzo/ })).toBeVisible();
});

test("on a phone, the bar at the bottom of an event opens the sign-up and says where you stand", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: "Comunidad con barra" });
  const start = new Date(Date.now() + 20 * 86_400_000);
  const event = await makeEvent(community.id, {
    name: "Meetup desde el teléfono",
    status: "published",
    registration: "owu",
    capacity: 30,
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });
  const page = await pageFor(await makeUser({ name: "Caro Teléfono" }));
  await page.setViewportSize(PHONE);

  await page.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  await page.getByRole("button", { name: "Anotarme" }).click();
  const sheet = page.getByRole("dialog", { name: "Meetup desde el teléfono" });
  await sheet.getByRole("button", { name: "Anotarme" }).click();

  await expect(sheet.getByText("Estás anotado")).toBeVisible();
});
