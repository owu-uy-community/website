import { makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, failNext, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

/** A community with one of everything: a dated and an undated draft, an upcoming event with people, a past one. */
async function seed() {
  const organizer = await makeOrganizer();
  const { community } = organizer;
  const start = new Date(Date.now() + 30 * DAY);
  const [held, undated, upcoming, past] = await Promise.all([
    makeEvent(community.id, {
      name: "Borrador con fecha",
      status: "draft",
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3_600_000),
      heldUntil: new Date(Date.now() + 10 * DAY),
    }),
    makeEvent(community.id, { name: "Borrador sin fecha", status: "draft" }),
    makePublishedEvent(community.id, { name: "Meetup que viene", capacity: 60 }),
    makePublishedEvent(community.id, { name: "Meetup que ya pasó", startsIn: -10 * DAY }),
  ]);
  await makeRegistrations(upcoming.id, 2);
  await makeRegistrations(upcoming.id, 1, { guests: 2 });
  await makeRegistrations(upcoming.id, 1, { status: "waitlisted" });

  return { ...organizer, held, undated, upcoming, past };
}

test("Eventos says who's coming, that past events passed, and drafts continue", async ({ pageFor }) => {
  const { organizer, panel, upcoming, past } = await seed();
  const page = await pageFor(organizer);
  await page.goto(`${panel}/eventos`);

  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await expect(row(upcoming.name)).toContainText("3 personas anotadas · 5 de 60 lugares · 1 en espera");
  await expect(row(upcoming.name)).toContainText("Publicado");
  await expect(row(past.name)).toContainText("Pasó");
  await expect(row(past.name)).not.toContainText("Publicado");
  await expect(page.getByRole("link", { name: "Continuar «Borrador sin fecha»" })).toBeVisible();
  await expectAccessible(page);
});

test("deleting a draft only mentions a reserved date when there is one", async ({ pageFor }) => {
  const { organizer, panel, held, undated } = await seed();
  const page = await pageFor(organizer);
  await page.goto(`${panel}/eventos`);

  await page.getByRole("button", { name: `Eliminar el borrador «${held.name}»` }).click();
  await expect(page.getByRole("alertdialog")).toContainText("la fecha reservada");
  await page.getByRole("button", { name: "Volver" }).click();

  await page.getByRole("button", { name: `Eliminar el borrador «${undated.name}»` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).not.toContainText("reservada");
  await dialog.getByRole("button", { name: "Eliminar borrador" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: undated.name })).toHaveCount(0);
});

test("when the counts fail the list still shows, with a way to retry", async ({ pageFor }) => {
  const { organizer, panel, upcoming } = await seed();
  const page = await pageFor(organizer);
  // The first try and its two retries fail; Reintentar gets through
  await failNext(page, "panel.headcounts", { times: 3 });
  await page.goto(`${panel}/eventos`);

  await expect(page.getByText("No pudimos contar a los anotados")).toBeVisible();
  await expect(page.getByRole("link", { name: upcoming.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: upcoming.name })).toContainText("3 personas anotadas");
});

test("the new-event dialog says when it couldn't bring earlier events", async ({ pageFor }) => {
  // Nothing ahead: nothing refreshes Inicio on its own, so the dialog's request travels alone
  const { organizer, panel } = await makeOrganizer();
  const page = await pageFor(organizer);
  await page.goto(panel);
  // Inicio's own reads done (their wording belongs to Inicio, not to this test)
  await page.waitForLoadState("networkidle");
  await failNext(page, "events.list");
  await page
    .getByRole("button", { name: /^Nuevo evento/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Nuevo evento" });
  await expect(dialog.getByText("No pudimos traer tus eventos anteriores")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Empezar de cero" })).toBeEnabled();
});
