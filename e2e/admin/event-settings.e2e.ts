import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { events } from "../../src/lib/db/schema";
import { makeCommunity, makeEvent } from "../../src/test/factories";
import { expect, test } from "../fixtures";

type Board = { community: { slug: string }; event: { slug: string }; rooms: { plain: { name: string } } };

// The board's event runs 17:30–23:30 UTC: 14:30–20:30 on Montevideo's clock.
const settingsUrl = (board: Board) => `/admin/communities/${board.community.slug}/events/${board.event.slug}`;

const saveBar = (page: Page) => page.getByRole("region", { name: "Cambios sin guardar" });

/** The page arrives rendered; its rooms load in the browser, so once they show, it is listening. */
async function open(page: Page, board: Board) {
  await page.goto(settingsUrl(board));
  await expect(page.getByRole("button", { name: `Editar ${board.rooms.plain.name}` })).toBeVisible();
}

const stored = async (id: string) => (await db.select().from(events).where(eq(events.id, id)))[0];

test("the event's times are edited on its own clock and saved from the bar", async ({ page, board }) => {
  await open(page, board);
  await expect(page.getByLabel("Hora de inicio")).toHaveValue("14:30");
  await expect(page.getByLabel("Hora de fin")).toHaveValue("20:30");
  await expect(saveBar(page)).toBeHidden();

  await page.getByLabel("Hora de fin").fill("21:45");
  await expect(saveBar(page)).toContainText("1 cambio sin guardar");
  await saveBar(page)
    .getByRole("button", { name: /Guardar/ })
    .click();

  await expect(page.getByText("Cambios guardados")).toBeVisible();
  await expect(saveBar(page)).toBeHidden();
  expect((await stored(board.event.id)).endDate.toISOString()).toBe("2026-11-08T00:45:00.000Z");

  // ⌘S / Ctrl+S saves too, even with the cursor still in the field.
  await page.getByLabel("Hora de inicio").fill("15:00");
  await expect(saveBar(page)).toContainText("1 cambio sin guardar");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(saveBar(page)).toBeHidden();
  expect((await stored(board.event.id)).startDate.toISOString()).toBe("2026-11-07T18:00:00.000Z");

  await page.reload();
  await expect(page.getByLabel("Hora de inicio")).toHaveValue("15:00");
  await expect(page.getByLabel("Hora de fin")).toHaveValue("21:45");
});

test("an end before the start says so and is never saved", async ({ page, board }) => {
  await open(page, board);

  await page.getByLabel("Hora de fin").fill("13:00");
  await expect(page.getByText("Tiene que terminar después de empezar")).toBeVisible();
  await saveBar(page)
    .getByRole("button", { name: /Guardar/ })
    .click();

  await expect(saveBar(page)).toContainText("1 cambio sin guardar");
  expect((await stored(board.event.id)).endDate.toISOString()).toBe(board.event.endDate.toISOString());

  await saveBar(page).getByRole("button", { name: "Descartar" }).click();
  await expect(page.getByLabel("Hora de fin")).toHaveValue("20:30");
  await expect(saveBar(page)).toBeHidden();
});

test("leaving with unsaved changes asks first", async ({ page, board }) => {
  await open(page, board);
  const url = page.url();
  const leave = page.getByRole("navigation", { name: "Ubicación" }).getByRole("link", { name: "Comunidades" });

  await page.getByLabel("Nombre").fill("Un nombre que no se guarda");
  await leave.click();
  const dialog = page.getByRole("alertdialog", { name: "¿Salir sin guardar?" });
  await expect(dialog).toContainText("1 cambio sin guardar");

  // Staying keeps the page and what was typed.
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.getByLabel("Nombre")).toHaveValue("Un nombre que no se guarda");

  // Leaving goes where the link pointed, and nothing was saved.
  await leave.click();
  await dialog.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(/\/admin\/communities$/);
  expect((await stored(board.event.id)).name).toBe(board.event.name);
});

test("with nothing changed, links just go", async ({ page, board }) => {
  await open(page, board);

  await page.getByRole("navigation", { name: "Ubicación" }).getByRole("link", { name: "Comunidades" }).click();

  await expect(page).toHaveURL(/\/admin\/communities$/);
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("a community is deleted from its danger zone once it has no events", async ({ page }) => {
  const name = `Para borrar ${Math.random().toString(36).slice(2, 8)}`;
  const community = await makeCommunity({ name });
  const event = await makeEvent(community.id);
  const confirm = page.getByRole("alertdialog");
  const remove = async () => {
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await confirm.getByRole("button", { name: "Eliminar la comunidad" }).click();
  };
  await page.goto(`/admin/communities/${community.slug}`);

  // With an event left, it stays and says why.
  await remove();
  await expect(page.getByText("tiene un evento: eliminalos primero")).toBeVisible();
  await db.delete(events).where(eq(events.id, event.id));
  await remove();

  await expect(page).toHaveURL(/\/admin\/communities$/);
  await expect(page.getByRole("table").getByText(name)).toBeHidden();
});
