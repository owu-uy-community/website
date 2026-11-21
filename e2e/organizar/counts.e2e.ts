import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, HOUR, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

// One event: 36 people with a seat (two bring a +1), one seat offered, six waiting.
// Every surface says the same: 39 de 40 lugares · 36 personas anotadas · 6 en espera.
test("Resumen, Inscriptos, Emails, Ajustes and the public page agree on the numbers", async ({ page, pageFor }) => {
  // Six surfaces, each checked with axe, over 45 seeded people
  test.slow();
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id, { capacity: 40 });
  await makeRegistrations(event.id, 2, { guests: 1 });
  await makeRegistrations(event.id, 34);
  await makeRegistrations(event.id, 1, { status: "offered", offerExpiresAt: new Date(Date.now() + 4 * HOUR) });
  await makeRegistrations(event.id, 6, { status: "waitlisted" });
  const labels = "39 de 40 lugares · 36 personas anotadas · 6 en espera";
  const panel = await pageFor(admin);
  const tab = (key: string) => panel.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=${key}`);

  await tab("resumen");
  const stats = panel.getByTestId("summary-stats");
  await expect(stats).toContainText("39/40");
  await expect(stats).toContainText("36 personas anotadas");
  await expectAccessible(panel, { include: "main" });

  await tab("inscriptos");
  await expect(panel.getByTestId("headcount")).toContainText(labels);
  await expectAccessible(panel, { include: "main" });

  await tab("emails");
  await expect(panel.getByText("36 personas anotadas · 6 en espera")).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Anotados/ })).toContainText("36");
  await expectAccessible(panel, { include: "main" });

  await tab("ajustes");
  await expect(panel.getByTestId("headcount")).toHaveText(labels);
  await expectAccessible(panel, { include: "main" });

  await tab("puerta");
  await expect(panel.getByText("Entraron en 15 minutos")).toBeVisible();
  await expectAccessible(panel, { include: "main" });

  await page.goto(`/comunidad/${community.slug}/events/${event.slug}`);
  const aside = page.getByRole("complementary");
  await expect(aside).toContainText("36 personas anotadas");
  await expect(aside).toContainText("Queda 1 lugar");
  // The event itself; the site's navbar and footer are another slice's
  await expectAccessible(page, { include: "main" });
});

test("a past event says how many came when the door was used, and nothing misleading when it wasn't", async ({
  page,
}) => {
  const { community } = await makeOrganizer();
  const withDoor = await makePublishedEvent(community.id, { startsIn: -30 * HOUR });
  await makeRegistrations(withDoor.id, 5, { checkedIn: 3 });
  const withoutDoor = await makePublishedEvent(community.id, { startsIn: -30 * HOUR });
  await makeRegistrations(withoutDoor.id, 5);

  await page.goto(`/comunidad/${community.slug}/events/${withDoor.slug}`);
  await expect(page.getByRole("complementary")).toContainText("Fueron 3");

  await page.goto(`/comunidad/${community.slug}/events/${withoutDoor.slug}`);
  await expect(page.getByRole("complementary")).toContainText("Este evento ya pasó");
  await expect(page.getByRole("complementary")).not.toContainText(/anotad|Fueron|Van/);
});
