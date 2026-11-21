import { createId } from "@paralleldrive/cuid2";

import { db } from "../../src/lib/db";
import { venueRequests } from "../../src/lib/db/schema";
import { makeCommunity, makeMember, makeVenue } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { HOUR, lastEmailTo, makePublishedEvent, makeRegistrations } from "./kit";

test("after the event, the organizer reviews the host recap in Espacios and sends it to the space", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: `Agradece ${createId().slice(0, 6)}` });
  const organizer = await makeMember(community.id, "editor", { name: "Orga Agradecida" });
  const host = { name: "Host Recap", email: `recap-${createId()}@test.owu.uy` };
  const venue = await makeVenue({ name: `Sala Recap ${createId().slice(0, 6)}` }, host);
  const event = await makePublishedEvent(community.id, { startsIn: -5 * HOUR, venueId: venue.id });
  await makeRegistrations(event.id, 4, { checkedIn: 3 });
  await db.insert(venueRequests).values({
    venueId: venue.id,
    communityId: community.id,
    eventId: event.id,
    requestedById: organizer.id,
    options: [{ start: event.startDate.toISOString(), end: event.endDate.toISOString() }],
    expectedAttendees: 40,
    status: "accepted",
    chosenOption: 0,
    respondedAt: new Date(Date.now() - 10 * 24 * HOUR),
    expiresAt: new Date(Date.now() - 9 * 24 * HOUR),
  });

  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  await panel.getByRole("button", { name: "Mandar el resumen al espacio" }).click();
  const dialog = panel.getByRole("dialog", { name: `Resumen para ${venue.name}` });
  await expect(dialog.getByText("Vinieron")).toBeVisible();
  await expect(dialog.getByRole("definition").first()).toHaveText("3");
  await dialog.getByRole("textbox").fill("¡Gracias por la sala y el café!");
  await dialog.getByRole("button", { name: `Mandar a 1 contacto de ${venue.name}` }).click();
  await expect(panel.getByText(`Le mandamos el resumen a ${venue.name}`)).toBeVisible();

  const recap = await lastEmailTo(panel.request, host.email, `Cómo salió «${event.name}»`);
  expect([
    recap.text.includes("3 personas vinieron"),
    recap.text.includes("café"),
    recap.text.includes("Persona 1"),
  ]).toStrictEqual([true, true, false]);
  await expect(panel.getByText(/Le mandaste el resumen el/)).toBeVisible();
});
