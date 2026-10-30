import { db } from "../../src/lib/db";
import { eventHosts } from "../../src/lib/db/schema";
import { makeCommunity, makeEvent, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, HOUR, expectAccessible, failNext, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

/** A Montevideo evening `days` from now, as an event's start and end. */
const evening = (days: number, hours = 2) => {
  const start = new Date(Date.now() + days * DAY);
  start.setUTCHours(22, 0, 0, 0);

  return { startDate: start, endDate: new Date(start.getTime() + hours * HOUR) };
};

test("a hold about to lapse is renewed in place; a released one can be taken back", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor", { description: "Meetups de prueba" });
  // Not new: it already published once
  await makePublishedEvent(community.id, { startsIn: -30 * DAY, name: "El del mes pasado" });
  const hold = await makeEvent(community.id, {
    name: "Meetup de diciembre",
    status: "draft",
    heldUntil: new Date(Date.now() + DAY),
    ...evening(25),
  });
  const page = await pageFor(organizer);
  await page.goto(panel);

  const holds = page.getByRole("region", { name: "Tus reservas" });
  await expect(holds.getByRole("progressbar", { name: "La reserva vence mañana" })).toBeVisible();
  await holds.getByRole("button", { name: /^Renovar la reserva/ }).click();
  await expect(page.getByText("Renovaste la reserva")).toBeVisible();
  await expect(holds.getByRole("progressbar", { name: /La reserva vence en 1[34] días/ })).toBeVisible();

  await holds.getByRole("button", { name: /^Liberar el/ }).click();
  await expect(page.getByText(/^Liberaste el/)).toBeVisible();
  await expect(holds.getByText(hold.name)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Actividad del equipo" })).toContainText("liberó la fecha reservada");

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("Volviste a reservar la fecha")).toBeVisible();
  await expect(holds.getByText(hold.name)).toBeVisible();
});

test("another community's invitation to co-organize is answered right in Para hacer", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  await makePublishedEvent(community.id, { startsIn: -10 * DAY });
  const host = await makeCommunity({ name: `Anfitriona ${Date.now().toString(36)}` });
  const hosted = await makePublishedEvent(host.id, { name: "Meetup en conjunto", startsIn: 30 * DAY });
  await db.insert(eventHosts).values({ eventId: hosted.id, communityId: community.id, status: "invited" });
  const page = await pageFor(organizer);
  await page.goto(panel);

  const todo = page.getByRole("region", { name: "Para hacer" }).filter({ visible: true });
  const row = todo.getByRole("listitem").filter({ hasText: `${host.name} los invita a coorganizar` });
  await row.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText("Ahora lo coorganizan")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("a new community gets its first steps, and finishing one ticks it", async ({ pageFor }) => {
  const community = await makeCommunity({ name: `Recién llegada ${Date.now().toString(36)}` });
  const owner = await makeMember(community.id, "owner");
  const page = await pageFor(owner);
  await page.goto(`/organizar/panel/${community.slug}`);

  const steps = page.getByRole("region", { name: "Primeros pasos" });
  await expect(steps).toContainText("0 de 4 listos");
  await expect(steps.getByRole("link", { name: /Completá el perfil.*\(pendiente\)/ })).toBeVisible();
  await expectAccessible(page);

  await steps.getByRole("link", { name: /Completá el perfil/ }).click();
  await expect(page).toHaveURL(/\/perfil#profile-description$/);
  await page.getByRole("textbox", { name: "Descripción" }).fill("Juntamos a quienes hacen cosas raras con Rust.");
  await page.getByRole("button", { name: /^Guardar/ }).click();
  await expect(page.getByText("Perfil guardado")).toBeVisible();

  await page.getByRole("link", { name: "Inicio" }).first().click();
  await expect(steps.getByRole("link", { name: /Completá el perfil.*\(listo\)/ })).toBeVisible();
  await expect(steps).toContainText("1 de 4 listos");
});

test("Para hacer brings up the close-out, slow sign-ups and a quiet community", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("editor");
  const done = await makeEvent(community.id, {
    name: "Meetup que ya pasó",
    status: "published",
    registration: "owu",
    ...evening(-3),
  });
  const next = await makePublishedEvent(community.id, { name: "Meetup que no se llena", startsIn: 6 * DAY - 2 * HOUR });
  await makeRegistrations(next.id, 12);
  const page = await pageFor(organizer);
  await page.goto(panel);

  const todo = page.getByRole("region", { name: "Para hacer" }).filter({ visible: true });
  await expect(todo.getByText(`Cerrá «${done.name}»`, { exact: false })).toBeVisible();
  await todo
    .getByRole("listitem")
    .filter({ hasText: `Cerrá «${done.name}»` })
    .getByRole("link", { name: "Cerrar" })
    .click();
  await expect(page).toHaveURL(`${panel}/eventos/${done.id}`);

  await page.goBack();
  await expect(
    todo.getByText(`«${next.name}»: faltan 6 días y van 12 de 40 lugares. Difundilo de nuevo`)
  ).toBeVisible();

  // Another community, quiet for 74 days
  const quiet = await makeOrganizer("editor");
  await makeEvent(quiet.community.id, { name: "Hace mucho", status: "published", ...evening(-74) });
  const other = await pageFor(quiet.organizer);
  await other.goto(quiet.panel);
  await expect(
    other
      .getByRole("region", { name: "Para hacer" })
      .filter({ visible: true })
      .getByText(/^Hace 7[34] días del último evento. ¿Armamos algo liviano\?$/)
  ).toBeVisible();
});

test("a failed summary or OWU feed says so and retries, never 'Nada pendiente'", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer("editor");
  const page = await pageFor(organizer);
  await failNext(page, "panel.summary", { times: 3 });
  await page.goto(panel);

  await expect(page.getByText("No pudimos traer el resumen")).toBeVisible();
  await expect(page.getByText("Nada pendiente. Bien ahí.")).toHaveCount(0);
  await page.unrouteAll();
  await page.getByRole("main").getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("region", { name: "Para hacer" }).filter({ visible: true })).toBeVisible();

  await failNext(page, "calendar.plan", { times: 6 });
  await page.reload();
  await expect(page.getByText("No pudimos traer el calendario de OWU")).toBeVisible();
});

test("Inicio passes axe with a full week", async ({ pageFor }) => {
  const { community, organizer, panel } = await makeOrganizer("admin");
  const next = await makePublishedEvent(community.id, { startsIn: 5 * DAY });
  await makeRegistrations(next.id, 3);
  await makeEvent(community.id, {
    name: "Reservado",
    status: "draft",
    heldUntil: new Date(Date.now() + 2 * DAY),
    ...evening(30),
  });
  const page = await pageFor(organizer);
  await page.goto(panel);
  await expect(page.getByRole("region", { name: "Próximo evento" })).toContainText(next.name);

  await expectAccessible(page);
});
