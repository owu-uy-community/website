import { makeCommunity, makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("a community's page and calendar feed show what it published in OWU", async ({ pageAs }) => {
  const community = await makeCommunity({
    name: "Comunidad con perfil",
    topics: ["web"],
    description: "Hacemos meetups.",
  });
  const start = new Date(Date.now() + 10 * 86_400_000);
  const event = await makeEvent(community.id, {
    name: "Meetup del perfil",
    status: "published",
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });

  const page = await pageAs("anonymous");
  await page.goto(`/comunidad/${community.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Comunidad con perfil" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Meetup del perfil/ })).toHaveAttribute(
    "href",
    `/comunidad/${community.slug}/events/${event.slug}`
  );

  const feed = await page.request.get(`/comunidad/${community.slug}/eventos.ics`);
  expect(await feed.text()).toContain("SUMMARY:Meetup del perfil");
});
