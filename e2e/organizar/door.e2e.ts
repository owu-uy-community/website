import { makeCommunity, makeEvent, makeMember, makeRsvp } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("an organizer hands out a door link; a volunteer without an account checks people in; revoking stops it", async ({
  pageFor,
  browser,
}) => {
  const community = await makeCommunity({ name: "Comunidad con puerta" });
  const event = await makeEvent(community.id, {
    name: "Meetup con puerta",
    status: "published",
    registration: "owu",
    startDate: new Date(Date.now() + 3_600_000),
    endDate: new Date(Date.now() + 3 * 3_600_000),
  });
  const owner = await makeMember(community.id, "owner");
  const ana = await makeRsvp(event.id, { name: "Ana Puerta" });

  const panel = await pageFor(owner);
  await panel.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=puerta`);
  await panel.getByRole("button", { name: "Crear el link" }).click();
  const link = (
    (await panel
      .getByText(/\/puerta\//)
      .first()
      .textContent()) ?? ""
  ).trim();

  const volunteer = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await volunteer.goto(link);
  await volunteer.getByRole("button", { name: "Código" }).click();
  await volunteer.getByPlaceholder("Código de la entrada").fill(ana.barcode ?? "");
  await volunteer.getByPlaceholder("Código de la entrada").press("Enter");
  await expect(volunteer.getByText("Ana Puerta").first()).toBeVisible();
  await expect(volunteer.getByText(/Adelante/)).toBeVisible();

  await panel.getByRole("button", { name: "Anular" }).click();
  await panel.getByRole("button", { name: "Anular los links" }).click();
  await volunteer.reload();
  await expect(volunteer.getByText("Este link de la puerta ya no sirve")).toBeVisible();
  await volunteer.close();
});
