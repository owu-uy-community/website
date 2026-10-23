import { expect, test } from "../fixtures";
import { expectAccessible, makeOrganizer, makePublishedEvent } from "./kit";

test("the Meetup card opens «Copiar a Meetup» of the next event", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer();
  const next = await makePublishedEvent(community.id, { name: "El que viene" });
  await makePublishedEvent(community.id, { name: "El de después", startsIn: 40 * 86_400_000 });
  const page = await pageFor(organizer);
  await page.goto(`${panel}/integraciones`);

  await expect(page.getByRole("link", { name: "Copiar a Meetup «El que viene»" })).toHaveAttribute(
    "href",
    `${panel}/eventos/${next.id}/editar?paso=difusion`
  );
  await expectAccessible(page, { include: "main" });
});

test("without events, the Meetup card offers to create one", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer();
  const page = await pageFor(organizer);
  await page.goto(`${panel}/integraciones`);

  await page.getByRole("button", { name: "Crear un evento para copiar" }).click();
  await expect(page.getByRole("dialog", { name: "Nuevo evento" })).toBeVisible();
});
