import type { Page } from "@playwright/test";

import { db } from "../../src/lib/db";
import { surveys } from "../../src/lib/db/schema";
import { expect, test } from "../fixtures";

/** A card on the page, by its title. */
const panel = (page: Page, title: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });

test("a message scheduled from the cadence waits in Owy's queue", async ({ page, board }) => {
  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=cadencia`);
  const step = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Recordatorio de Owy" }) });

  await step.getByRole("button", { name: "Programar" }).click();
  const editor = page.getByRole("dialog");
  // The copy comes filled in from the event.
  await expect(editor.getByLabel("Mensaje")).toHaveValue(new RegExp(`Mañana es ${board.event.name}`));
  await editor.getByRole("button", { name: "Programar" }).click();

  await expect(editor).toBeHidden();
  await expect(step.getByText("programado", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Owy/ }).click();
  await expect(panel(page, "Programados")).toContainText(`Mañana es ${board.event.name}`);
});

test("someone answers the survey from a room's QR, once, and it shows in the results", async ({
  page,
  pageAs,
  board,
}) => {
  await db.insert(surveys).values({
    eventId: board.event.id,
    title: "¿Qué tal estuvo?",
    isOpen: true,
    questions: [
      { id: "nps", kind: "nps", label: "¿Nos recomendarías?" },
      { id: "comentarios", kind: "text", label: "¿Algo más?" },
    ],
  });
  const phone = await pageAs("anonymous");
  await phone.goto(`/comunidad/${board.community.slug}/events/${board.event.slug}/encuesta?sala=${board.rooms.tv.id}`);

  await expect(phone.getByText(`Sala ${board.rooms.tv.name}`)).toBeVisible();
  await phone.getByText("10", { exact: true }).click();
  await phone.getByLabel("¿Algo más?").fill("Muy buena la sala");
  await phone.getByRole("button", { name: "Enviar respuestas" }).click();
  await expect(phone.getByRole("heading", { name: "¡Gracias!" })).toBeVisible();
  // The phone remembers it answered.
  await phone.reload();
  await expect(phone.getByRole("heading", { name: "¡Gracias!" })).toBeVisible();

  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=encuesta`);
  await expect(page.getByRole("row", { name: new RegExp(board.rooms.tv.name) })).toContainText("+100");
  await expect(panel(page, "Resultados")).toContainText("Muy buena la sala");
});
