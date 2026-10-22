import { makeCommunity, makeEvent, makeUser } from "../../src/test/factories";
import { expect, test } from "../fixtures";

test("one seat: the second person waits, the first frees it, the second confirms the offer", async ({ pageFor }) => {
  const community = await makeCommunity({ name: "Comunidad con cupo" });
  const start = new Date(Date.now() + 30 * 86_400_000);
  const event = await makeEvent(community.id, {
    name: "Taller con un lugar",
    status: "published",
    registration: "owu",
    capacity: 1,
    startDate: start,
    endDate: new Date(start.getTime() + 2 * 3_600_000),
  });
  const url = `/comunidad/${community.slug}/events/${event.slug}`;
  const [ana, beto] = await Promise.all([makeUser({ name: "Ana" }), makeUser({ name: "Beto" })]);

  const first = await pageFor(ana);
  await first.goto(url);
  await first.getByRole("button", { name: "Anotarme" }).click();
  await expect(first.getByText("Estás anotado")).toBeVisible();

  const second = await pageFor(beto);
  await second.goto(url);
  await second.getByRole("button", { name: "Anotarme en la lista de espera" }).click();
  await expect(second.getByText(/Estás en la lista de espera, puesto 1/)).toBeVisible();

  await first.getByRole("button", { name: /No puedo ir/ }).click();
  await expect(first.getByRole("button", { name: /Anotarme/ })).toBeVisible();

  await second.reload();
  await expect(second.getByText(/Se liberó un lugar para vos/)).toBeVisible();
  await second.getByRole("button", { name: "Confirmar mi lugar" }).click();
  await expect(second.getByText("Estás anotado")).toBeVisible();
});
