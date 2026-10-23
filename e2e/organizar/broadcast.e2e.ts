import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeMember, makeVenue } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import { lastEmailTo, linkIn } from "./kit";

test("«Buscamos espacio» goes to two spaces; the first host takes it and the second reads «ya se resolvió»", async ({
  pageFor,
  browser,
}) => {
  const tag = createId().slice(0, 6);
  const community = await makeCommunity({ name: `Busca espacio ${tag}` });
  const organizer = await makeMember(community.id, "editor", { name: "Orga Varios" });
  // Amenities no other spec's spaces have, so these two are the ones that fit
  const amenities = ["microfono", "comida"] as ("microfono" | "comida")[];
  const hosts = [
    { name: "Host Uno", email: `uno-${createId()}@test.owu.uy` },
    { name: "Host Dos", email: `dos-${createId()}@test.owu.uy` },
  ];
  const [first, second] = await Promise.all(
    hosts.map((host, index) =>
      makeVenue({ name: `Espacio ${index + 1} ${tag}`, capacity: 80, leadDays: 1, amenities }, host)
    )
  );

  const panel = await pageFor(organizer);
  await panel.goto(`/organizar/panel/${community.slug}/espacios`);
  await panel.getByRole("toolbar", { name: "Equipamiento" }).getByRole("button", { name: "Micrófono" }).click();
  await panel
    .getByRole("toolbar", { name: "Equipamiento" })
    .getByRole("button", { name: "Comida", exact: true })
    .click();
  await panel.getByRole("button", { name: "Pedir a varios a la vez" }).click();
  const composer = panel.getByRole("dialog");
  await composer.getByLabel("Fecha 1").fill("2029-10-11");
  await composer.getByLabel("Cuántas personas esperan").fill("45");
  await expect(composer.getByText(`${first.name}, ${second.name}`)).toBeVisible();
  await composer.getByRole("button", { name: "Pedir a 2 espacios" }).click();
  await expect(panel.getByText("Pedido enviado a 2 espacios")).toBeVisible();

  const links = await Promise.all(
    hosts.map(async (host) =>
      linkIn(await lastEmailTo(panel.request, host.email, "quiere hacer su meetup"), "/espacios/pedido/")
    )
  );

  const winner = await browser.newPage({ storageState: signedOut });
  await winner.goto(links[0] ?? "");
  await winner.getByRole("button", { name: /Sí, los recibimos/ }).click();
  await expect(winner.getByText("Los recibís")).toBeVisible();
  await winner.close();

  const late = await browser.newPage({ storageState: signedOut });
  await late.goto(links[1] ?? "");
  await expect(late.getByText("Ya se resolvió, ¡gracias!")).toBeVisible();
  await expect(late.getByRole("button", { name: /Sí, los recibimos/ })).toHaveCount(0);
  await late.close();
  await lastEmailTo(panel.request, hosts[1]?.email ?? "", "Ya se resolvió");

  await panel.reload();
  await expect(panel.getByText("Otro espacio aceptó")).toBeVisible();
});
