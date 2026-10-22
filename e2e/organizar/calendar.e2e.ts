import { createId } from "@paralleldrive/cuid2";

import { makeCommunity, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

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
