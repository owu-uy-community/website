import type { Page } from "@playwright/test";

import { db } from "../../src/lib/db";
import { outboundMessages, staffAnnouncementAcks, staffAnnouncements, surveys } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
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

test("an announcement is edited, asking everyone to read it again, and then deleted", async ({ page, board }) => {
  const author = await makeMember(board.community.id, "editor", { name: "Laura Autora" });
  const reader = await makeMember(board.community.id, "member", { name: "Leo Lector" });
  const [sent] = await db
    .insert(staffAnnouncements)
    .values({ openSpaceId: board.event.id, authorId: author.id, body: "Nos vemos en la puerta" })
    .returning({ id: staffAnnouncements.id });
  await db.insert(staffAnnouncementAcks).values({ announcementId: sent.id, userId: reader.id });
  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=anuncios`);
  await expect(page.locator("article", { hasText: "Nos vemos en la puerta" })).toContainText("1/1");

  await page.getByRole("button", { name: "Más acciones del anuncio" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Texto del anuncio").fill("Nos vemos en el patio");
  await editor.getByRole("switch", { name: /Pedir que lo vuelvan a leer/ }).click();
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(editor).toBeHidden();
  const edited = page.locator("article", { hasText: "Nos vemos en el patio" });
  // Asked again: whoever had read it is waiting on it once more.
  await expect(edited).toContainText("editado");
  await expect(edited).toContainText("0/1");

  await edited.getByRole("button", { name: "Más acciones del anuncio" }).click();
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Borrar anuncio" }).click();

  await expect(edited).toBeHidden();
  await expect(page.getByText("Todavía no hay anuncios")).toBeVisible();
});

test("a message Owy sent before the site kept track leaves the history, saying it stays in Telegram", async ({
  page,
  board,
}) => {
  await db.insert(outboundMessages).values({
    eventId: board.event.id,
    channel: "telegram",
    body: "Mañana abrimos a las 14:30",
    status: "sent",
    sentAt: new Date(),
  });
  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=owy`);
  const row = panel(page, "Historial").getByRole("listitem").filter({ hasText: "Mañana abrimos" });

  // Nothing to rewrite it with in Telegram: no «Editar», only «Borrar».
  await expect(row.getByRole("button", { name: "Editar" })).toBeHidden();
  await row.getByRole("button", { name: "Borrar" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("en Telegram queda");
  await confirm.getByRole("button", { name: "Borrar mensaje" }).click();

  await expect(row).toBeHidden();
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

test("a survey is deleted from its menu, and the event can start a new one", async ({ page, board }) => {
  await db.insert(surveys).values({ eventId: board.event.id, title: "Encuesta de prueba", questions: [] });
  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=encuesta`);

  await page.getByRole("button", { name: "Más acciones de la encuesta" }).click();
  await page.getByRole("menuitem", { name: "Borrar encuesta" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Borrar encuesta" }).click();

  await expect(page.getByText("Todavía no hay encuesta")).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear encuesta" })).toBeVisible();
});
