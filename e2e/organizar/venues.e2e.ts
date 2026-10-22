import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeMember, makeVenue } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("an organizer asks a space for a date and its host accepts from the emailed link", async ({
  pageFor,
  browser,
}) => {
  const community = await makeCommunity({ name: `Pide espacio ${createId().slice(0, 6)}` });
  const organizer = await makeMember(community.id, "editor", { name: "Orga Nizadora" });
  const host = { name: "Host E2E", email: `host-${createId()}@test.owu.uy` };
  const venue = await makeVenue({ name: `Sala ${createId().slice(0, 6)}`, hostDays: [], leadDays: 1 }, host);

  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  const card = panel.getByRole("listitem").filter({ hasText: venue.name });
  await card.getByRole("button", { name: "Pedir lugar" }).click();
  const composer = panel.getByRole("dialog");
  await composer.getByLabel("Fecha 1").fill("2029-10-09");
  await composer.getByLabel("Cuántas personas esperan").fill("35");
  await composer.getByRole("button", { name: /Enviar pedido/ }).click();
  await expect(panel.getByText(`Pedido enviado a ${venue.name}`)).toBeVisible();

  // The request goes out right after the response; read it from the e2e mailbox
  let link = "";
  await expect(async () => {
    const mail = (await (await panel.request.get(`/api/dev/mailbox?to=${encodeURIComponent(host.email)}`)).json()) as {
      text: string;
    }[];
    link = /\/espacios\/pedido\/\S+/.exec(mail[0]?.text ?? "")?.[0] ?? "";
    expect(link).not.toBe("");
  }).toPass();

  const hostPage = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await hostPage.goto(link);
  await expect(hostPage.getByText(`${community.name} quiere hacer su meetup en ${venue.name}`)).toBeVisible();
  await hostPage.getByRole("textbox").fill("Timbre 2");
  await hostPage.getByRole("button", { name: /Sí, los recibimos/ }).click();
  await expect(hostPage.getByText("Los recibís")).toBeVisible();
  await hostPage.close();

  await panel.reload();
  await expect(panel.getByText("Aceptado")).toBeVisible();
  await expect(panel.getByText("«Timbre 2»")).toBeVisible();
});
