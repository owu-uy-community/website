import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { datePolls, eventHosts } from "../../src/lib/db/schema";
import { dateParts, dayKey } from "../../src/lib/community/time";
import { makeCommunity, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { DAY, expectAccessible, failNext, lastEmailTo, makeOrganizer, runTick } from "./kit";

/** A Montevideo day `days` from now, and how Votar fecha names it ("jue 12 nov"). */
const inDays = (days: number) => dayKey(new Date(Date.now() + days * DAY));
const label = (day: string) => {
  const parts = dateParts(`${day}T12:00:00Z`, "UTC");

  return `${parts.weekday} ${parts.day} ${parts.month}`;
};

/** Two more communities in the directory, each with an editor. */
async function neighbours() {
  const tag = Date.now().toString(36);
  const [b, c] = await Promise.all([
    makeCommunity({ name: `Invitada B ${tag}`, listed: true }),
    makeCommunity({ name: `Invitada C ${tag}`, listed: true }),
  ]);
  const [bEditor, cEditor] = await Promise.all([makeMember(b.id, "editor"), makeMember(c.id, "editor")]);

  return { b, c, bEditor, cEditor };
}

test("A asks B and C, B answers from its own panel, A picks the day: it's reserved and B is invited to co-host", async ({
  pageFor,
  request,
}) => {
  const { community: a, organizer, panel } = await makeOrganizer("editor", { listed: true });
  const { b, c, bEditor } = await neighbours();
  const [first, second] = [inDays(30), inDays(37)];

  const asker = await pageFor(organizer);
  await asker.goto(`${panel}/encuestas`);
  await expect(asker.getByRole("heading", { level: 1, name: "Votar fecha" })).toBeVisible();
  await asker.getByRole("button", { name: "Nueva votación" }).first().click();
  await asker.getByRole("textbox", { name: "Para qué evento" }).fill("Meetup conjunto de prueba");
  await asker.getByLabel("Fecha 1").fill(first);
  await asker.getByLabel("Fecha 2").fill(second);
  for (const invited of [b, c]) {
    await asker.getByRole("combobox", { name: "Sumar una comunidad" }).click();
    await asker.getByRole("option", { name: invited.name }).click();
  }
  await asker.getByRole("button", { name: "Enviar a 2 comunidades" }).click();
  await expect(asker.getByText("Les avisamos por mail a 2 comunidades.")).toBeVisible();

  await runTick(request);
  await lastEmailTo(request, bEditor.email, `${a.name} pregunta qué fecha le sirve a ${b.name}`);

  // B answers in its own session
  const invitee = await pageFor(bEditor);
  await invitee.goto(`/organizar/panel/${b.slug}/encuestas`);
  await invitee.getByRole("button", { name: `Tu respuesta para el ${label(second)}: sin responder` }).click();
  await invitee.getByRole("menuitemradio", { name: "Sí" }).click();
  await expect(invitee.getByRole("button", { name: `Tu respuesta para el ${label(second)}: sí` })).toBeVisible();
  await expectAccessible(invitee, { include: "main" });

  // A sees it and picks that day: the confirm says who gets invited
  await asker.reload();
  await expect(asker.getByRole("row", { name: new RegExp(b.name) })).toContainText("Sí");
  await asker.getByRole("button", { name: `Elegir el ${label(second)}` }).click();
  await asker.getByRole("button", { name: "Reservar e invitar a 1 comunidad" }).click();
  await expect(asker.getByText("Fecha reservada")).toBeVisible();
  await expect(asker.getByRole("link", { name: "seguir armando el evento" })).toBeVisible();

  await asker.goto(`${panel}/eventos`);
  await expect(asker.getByRole("listitem").filter({ hasText: "Meetup conjunto de prueba" })).toContainText("Reservado");

  // B is on the draft as an invited co-host: the invitation mail goes out when A publishes it
  const [chosen] = await db.select().from(datePolls).where(eq(datePolls.communityId, a.id));
  expect(chosen.chosenDay).toBe(second);
  const hosts = await db
    .select({ status: eventHosts.status })
    .from(eventHosts)
    .where(and(eq(eventHosts.eventId, chosen.eventId ?? ""), eq(eventHosts.communityId, b.id)));
  expect(hosts).toStrictEqual([{ status: "invited" }]);
});

test("the asker closes a vote (no more answers) and deletes it with Deshacer", async ({ pageFor }) => {
  const { community: a, organizer, panel } = await makeOrganizer("editor", { listed: true });
  const { b, bEditor } = await neighbours();
  const [poll] = await db
    .insert(datePolls)
    .values({ communityId: a.id, title: "Votación para cerrar", days: [inDays(20), inDays(21)], invited: [b.id] })
    .returning();

  const asker = await pageFor(organizer);
  await asker.goto(`${panel}/encuestas`);
  // A new community: this vote is the only one on the page
  await asker.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(asker.getByText("Votación cerrada")).toBeVisible();
  await expect(asker.getByText("Cerrada", { exact: true })).toBeVisible();

  const invitee = await pageFor(bEditor);
  await invitee.goto(`/organizar/panel/${b.slug}/encuestas`);
  await expect(invitee.getByText(poll.title)).toBeVisible();
  await expect(invitee.getByRole("button", { name: /^Tu respuesta para el/ })).toHaveCount(0);

  await asker.getByRole("button", { name: `Borrar la votación «${poll.title}»` }).click();
  await expect(asker.getByText(poll.title, { exact: true })).toHaveCount(0);
  await asker.getByRole("button", { name: "Deshacer" }).click();
  await expect(asker.getByText(poll.title, { exact: true })).toBeVisible();
});

test("an empty Votar fecha teaches, and the communities list says when it failed", async ({ pageFor }) => {
  const { organizer, panel } = await makeOrganizer();
  const page = await pageFor(organizer);
  await page.goto(`${panel}/encuestas`);

  await expect(page.getByText("Ninguna votación todavía")).toBeVisible();
  await expectAccessible(page, { include: "main" });
  await failNext(page, "communities.list");
  // The inline button, in the empty state
  await page.getByRole("button", { name: "Nueva votación" }).last().click();
  await expect(page.getByText("No pudimos traer las comunidades")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
});
