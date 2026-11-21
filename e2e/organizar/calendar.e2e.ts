import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { events } from "../../src/lib/db/schema";
import { makeCommunity, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, failNext } from "./kit";

test("a hold shows on another community's calendar without its title, until it's released", async ({ pageFor }) => {
  const topic = `e2e-${createId().slice(0, 8)}`;
  const [ours, theirs] = await Promise.all([
    makeCommunity({ name: `Reserva A ${topic}`, topics: [topic] }),
    makeCommunity({ name: `Calendario B ${topic}`, topics: [topic] }),
  ]);
  const [organizer, neighbour] = await Promise.all([makeMember(ours.id, "editor"), makeMember(theirs.id, "editor")]);
  const day = "?mes=2029-03&dia=2029-03-14";

  const mine = await pageFor(organizer);
  await mine.goto(`/organizar/panel/${ours.slug}/calendario${day}`);
  await mine.getByRole("textbox", { name: "Qué es (opcional)" }).fill("Algo que no se ve");
  await mine.getByRole("button", { name: /Reservar/ }).click();
  await expect(mine.getByText("Reservaste este día")).toBeVisible();

  const other = await pageFor(neighbour);
  await other.goto(`/organizar/panel/${theirs.slug}/calendario${day}`);
  await expect(other.getByText(`Reserva tentativa de ${ours.name} a la misma hora`)).toBeVisible();
  await expect(other.getByText("Reserva tentativa", { exact: true })).toBeVisible();
  await expect(other.getByText("Algo que no se ve")).toHaveCount(0);

  // The arrow keys walk the month
  await other.getByRole("button", { name: /^miércoles 14 de marzo/ }).focus();
  await other.keyboard.press("ArrowRight");
  await expect(other.getByRole("heading", { name: /jueves 15 de marzo/ })).toBeVisible();
  await expect(other.getByRole("button", { name: /^jueves 15 de marzo/ })).toBeFocused();

  await mine.getByRole("button", { name: "Liberar" }).click();
  await expect(mine.getByText("Liberaste la fecha")).toBeVisible();
  await other.goto(`/organizar/panel/${theirs.slug}/calendario${day}`);
  await expect(other.getByText(`Reserva tentativa de ${ours.name} a la misma hora`)).toHaveCount(0);
});

test("a Saturday workshop from 10:00 for 6 hours can be held, from the calendar and from the wizard", async ({
  pageFor,
}) => {
  const community = await makeCommunity({ name: `Talleres ${createId().slice(0, 6)}` });
  const organizer = await makeMember(community.id, "editor");
  const page = await pageFor(organizer);

  // Saturday 17 March 2029
  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-03&dia=2029-03-17`);
  // Scored days mean the page is hydrated: typing before that is reset by React
  await expect(page.getByRole("button", { name: /^sábado 17 de marzo, / })).toBeVisible();
  await page.getByLabel("Hora de inicio").fill("10:00");
  await expect(page.getByLabel("Hora de inicio")).toHaveValue("10:00");
  await page.getByRole("combobox", { name: "Duración" }).click();
  await page.getByRole("option", { name: "6 h", exact: true }).click();
  await page.getByRole("button", { name: "Reservar · 10:00–16:00" }).click();
  await expect(page.getByText("Reservaste este día")).toBeVisible();
  await expect
    .poll(async () =>
      (await db.select().from(events).where(eq(events.communityId, community.id))).map((event) => [
        event.startDate.toISOString(),
        event.endDate.toISOString(),
      ])
    )
    .toStrictEqual([["2029-03-17T13:00:00.000Z", "2029-03-17T19:00:00.000Z"]]);

  // The wizard's date step takes the same free times: the hold moves to Saturday 24 March, 10:15 for 6 h
  const [draft] = await db.select().from(events).where(eq(events.communityId, community.id));
  await page.goto(`/organizar/panel/${community.slug}/eventos/${draft.id}/editar?paso=fecha`);
  await expect(page.getByText("marzo de 2029")).toBeVisible();
  await page.getByLabel("Hora de inicio").fill("10:15");
  await page.getByRole("combobox", { name: "Duración" }).click();
  await page.getByRole("option", { name: "6 h", exact: true }).click();
  await page.getByRole("button", { name: /^sábado 24 de marzo/ }).click();
  await page.getByRole("button", { name: "Reservar esta fecha" }).click();
  await expect(page.getByText(/Reservaste el sáb 24 mar · 10:15/)).toBeVisible();
  const [dated] = await db.select().from(events).where(eq(events.id, draft.id));
  expect([dated.startDate.toISOString(), dated.endDate.toISOString()]).toStrictEqual([
    "2029-03-24T13:15:00.000Z",
    "2029-03-24T19:15:00.000Z",
  ]);
});

test("days read in words, the layers switch on and off, and the reasons read whole", async ({ pageFor }) => {
  const community = await makeCommunity({ name: `Palabras ${createId().slice(0, 6)}` });
  const page = await pageFor(await makeMember(community.id, "editor"));

  // August 2029: Saturday 25 is Declaratoria de la Independencia
  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-08`);
  const holiday = page.getByRole("button", { name: /^sábado 25 de agosto/ });
  await expect(holiday).toContainText(/Libre|Con cuidado|Choca/);
  await expect(holiday).toHaveAttribute("title", /^Puntaje \d+ de 100$/);
  await expect(holiday).toContainText("Declaratoria de la Independencia");

  const holidays = page.getByRole("button", { name: "Feriados" });
  await expect(holidays).toHaveAttribute("aria-pressed", "true");
  await holidays.click();
  await expect(holidays).toHaveAttribute("aria-pressed", "false");
  await expect(holiday).not.toContainText("Declaratoria de la Independencia");
  await expect(page).toHaveURL(/capas=/);

  // The suggestions say why in full, never cut with an ellipsis
  const reasons = page.getByRole("region", { name: "Fechas sugeridas" }).getByRole("button");
  await expect(reasons.first()).toBeVisible();
  expect(
    await reasons.evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth + 1))
  ).toBe(true);
  await expectAccessible(page);
});

test("when our events don't load, the calendar says so and retries instead of looking empty", async ({ pageFor }) => {
  const community = await makeCommunity({ name: `Sin eventos ${createId().slice(0, 6)}` });
  const page = await pageFor(await makeMember(community.id, "editor"));
  // The first try and its two retries
  await failNext(page, "events.list", { times: 3 });

  await page.goto(`/organizar/panel/${community.slug}/calendario?mes=2029-03`);
  // The month's scores travel in the same batch, so either may be the one that says it
  await expect(page.getByText(/^No pudimos (traer tus eventos y reservas|armar el calendario)$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^miércoles 14 de marzo/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("button", { name: /^miércoles 14 de marzo/ })).toBeVisible();
});
