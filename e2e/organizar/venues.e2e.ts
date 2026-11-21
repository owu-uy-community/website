import { createId } from "@paralleldrive/cuid2";
import type { Page } from "@playwright/test";

import { makeCommunity, makeMember, makeVenue } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import { expectAccessible, lastEmailTo, linkIn } from "./kit";

/** An organizer and a space that takes requests, with a host whose mail the spec reads. */
async function setup() {
  const community = await makeCommunity({ name: `Pide espacio ${createId().slice(0, 6)}` });
  const organizer = await makeMember(community.id, "editor", { name: "Orga Nizadora" });
  const host = { name: "Host E2E", email: `host-${createId()}@test.owu.uy` };
  const venue = await makeVenue({ name: `Sala ${createId().slice(0, 6)}`, hostDays: [], leadDays: 1 }, host);

  return { community, organizer, host, venue };
}

/** From Espacios, ask the space for one date; returns the host's link from the mailbox. */
async function ask(panel: Page, venueName: string, hostEmail: string, day = "2029-10-09") {
  const card = panel.getByRole("listitem").filter({ hasText: venueName });
  await card.getByRole("button", { name: "Pedir lugar" }).click();
  const composer = panel.getByRole("dialog");
  await composer.getByLabel("Fecha 1").fill(day);
  await composer.getByLabel("Cuántas personas esperan").fill("35");
  await composer.getByRole("button", { name: /Enviar pedido/ }).click();
  await expect(panel.getByText(`Pedido enviado a ${venueName}`)).toBeVisible();

  return linkIn(await lastEmailTo(panel.request, hostEmail, "quiere hacer su meetup"), "/espacios/pedido/");
}

test("an organizer asks a space for a date and its host accepts from the emailed link", async ({
  pageFor,
  browser,
}) => {
  const { community, organizer, host, venue } = await setup();

  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  const link = await ask(panel, venue.name, host.email);

  const hostPage = await browser.newPage({ storageState: signedOut });
  await hostPage.goto(link);
  await expect(hostPage.getByText(`${community.name} quiere hacer su meetup en ${venue.name}`)).toBeVisible();
  await hostPage.getByRole("textbox").fill("Timbre 2");
  await hostPage.getByRole("button", { name: /Sí, los recibimos/ }).click();
  await expect(hostPage.getByText("Los recibís")).toBeVisible();
  await hostPage.close();

  await panel.reload();
  await expect(panel.getByText("Aceptado", { exact: true })).toBeVisible();
  await expect(panel.getByText("«Timbre 2»")).toBeVisible();
});

test("a host says «esta vez no»; the organizer sees it and can cancel another request and undo it", async ({
  pageFor,
  browser,
}) => {
  const { community, organizer, host, venue } = await setup();
  const other = await makeVenue({ name: `Otra sala ${createId().slice(0, 6)}`, leadDays: 1 });
  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  const link = await ask(panel, venue.name, host.email);

  const hostPage = await browser.newPage({ storageState: signedOut });
  await hostPage.goto(link);
  await hostPage.getByRole("radio", { name: "Esta vez no" }).click();
  await hostPage.getByRole("textbox").fill("Ese mes estamos de mudanza");
  await hostPage.getByRole("button", { name: "Avisar que esta vez no" }).click();
  await expect(hostPage.getByRole("status")).toContainText("Esta vez no");
  await hostPage.close();

  await ask(panel, other.name, other.contact?.email ?? "");
  const pending = panel.getByRole("listitem").filter({ hasText: other.name }).filter({ hasText: "vence" });
  await pending.getByRole("button", { name: "Cancelar" }).click();
  await panel.getByRole("button", { name: "Deshacer" }).click();
  await expect(panel.getByText("El pedido sigue en pie")).toBeVisible();
  await panel.reload();
  await expect(panel.getByText("«Ese mes estamos de mudanza»")).toBeVisible();
  await expect(
    panel.getByRole("listitem").filter({ hasText: other.name }).getByText("Esperando respuesta")
  ).toBeVisible();
});

test("a host proposes another date and the organizer takes it from Espacios", async ({ pageFor, browser }) => {
  const { community, organizer, host, venue } = await setup();
  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  const link = await ask(panel, venue.name, host.email);

  const hostPage = await browser.newPage({ storageState: signedOut });
  await hostPage.goto(link);
  await hostPage.getByRole("radio", { name: "Otra fecha" }).click();
  await hostPage.getByLabel("Fecha 1").fill("2029-10-16");
  await hostPage.getByLabel("Hora 1").fill("18:30");
  await hostPage.getByRole("button", { name: "Proponer esta fecha" }).click();
  await expect(hostPage.getByText("Propusiste otras fechas")).toBeVisible();
  await hostPage.close();

  await lastEmailTo(panel.request, organizer.email, "propone otra fecha");
  await panel.reload();
  const card = panel.getByRole("listitem").filter({ hasText: venue.name }).filter({ hasText: "Propone" });
  await expect(card.getByText("mar 16 oct · 18:30")).toBeVisible();
  await card.getByRole("button", { name: "Aceptar esta fecha" }).click();
  await expect(panel.getByText(`${venue.name} los recibe el mar 16 oct · 18:30`)).toBeVisible();
  await expect(panel.getByText("Aceptado", { exact: true })).toBeVisible();
  await lastEmailTo(panel.request, host.email, "Confirmado");
});

test("Espacios and its request sheet pass axe", async ({ pageFor }) => {
  const { community, organizer, venue } = await setup();
  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  await expect(panel.getByText(venue.name)).toBeVisible();
  // The page, not the shell around it (the shell is checked with its own slice)
  await expectAccessible(panel, { include: "main" });

  await panel.getByRole("button", { name: "Pedir a varios a la vez" }).click();
  await expect(panel.getByRole("dialog", { name: "Pedir a varios espacios a la vez" })).toBeVisible();
  await expectAccessible(panel, { include: "[role=dialog]" });
});
