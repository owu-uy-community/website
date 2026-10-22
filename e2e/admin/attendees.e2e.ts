import { readFile } from "node:fs/promises";

import { makeAttendee } from "../../src/test/factories";
import { expect, test } from "../fixtures";

const table = (page: import("@playwright/test").Page) => page.getByRole("table");

test("search, filters and a selection export just those attendees", async ({ page, board }) => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  await makeAttendee(board.event.id, { name: "María Pérez", ticketClass: "General" });
  await makeAttendee(board.event.id, { name: "Bruno Cabrera", ticketClass: "General" });
  await makeAttendee(board.event.id, {
    name: "Lucía Sosa",
    ticketClass: "Estudiante",
    checkedInAt: minutesAgo(3),
    checkinSource: "eventbrite",
    checkinDevice: "Escaneo",
  });
  await page.goto(`/admin/${board.community.slug}/attendees?event=${board.event.slug}`);

  await page.getByLabel("Buscar asistentes").fill("maria");
  await expect(table(page).getByText("María Pérez")).toBeVisible();
  await expect(table(page).getByText("Bruno Cabrera")).toBeHidden();
  await expect(page).toHaveURL(/[?&]q=maria/);

  await page.getByRole("button", { name: "Borrar la búsqueda" }).click();
  await page.getByRole("tab", { name: /Acreditados/ }).click();
  await expect(table(page).getByText("Lucía Sosa")).toBeVisible();
  await expect(table(page).getByText("María Pérez")).toBeHidden();

  await page.getByRole("tab", { name: /Todos/ }).click();
  await page.getByRole("button", { name: "Entrada" }).click();
  await page.getByRole("option", { name: /General/ }).click();
  await page.keyboard.press("Escape");
  await expect(table(page).getByText("Lucía Sosa")).toBeHidden();
  await expect(page).toHaveURL(/[?&]entrada=General/);

  await page.getByRole("checkbox", { name: "Elegir a todos los de esta página" }).click();
  await expect(page.getByRole("toolbar", { name: "Acciones sobre la selección" })).toContainText("2 seleccionados");
  const download = page.waitForEvent("download");
  await page
    .getByRole("toolbar", { name: "Acciones sobre la selección" })
    .getByRole("button", { name: "Exportar" })
    .click();
  const file = await download;

  expect(file.suggestedFilename()).toBe(`asistentes-${board.event.slug}.csv`);
  const csv = await readFile(await file.path(), "utf8");
  expect(csv).toContain("María Pérez");
  expect(csv).toContain("Bruno Cabrera");
  expect(csv).not.toContain("Lucía Sosa");
});

test("the scanner's typed code lets someone in once, then says they're in", async ({ page, board }) => {
  await makeAttendee(board.event.id, { name: "Camila Rodríguez", barcode: "E2E-0001", ticketClass: "General" });
  await page.goto(`/admin/${board.community.slug}/attendees/escanear?event=${board.event.slug}`);
  const admit = async () => {
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.getByLabel("El número debajo del QR de la entrada").fill("E2E-0001");
    await page.getByRole("button", { name: "Acreditar" }).click();
  };

  await admit();
  await expect(page.getByText(/Adelante/i)).toBeVisible();
  await expect(page.getByText("Camila Rodríguez")).toBeVisible();
  await page.getByText("Tocá para seguir").click();

  await admit();
  await expect(page.getByText(/Ya entró/i)).toBeVisible();
  await expect(page.getByText(/Entró a las \d{2}:\d{2} · Puerta/)).toBeVisible();
});

test("a wrong check-in is undone from the list, back to «Por llegar»", async ({ page, board }) => {
  await makeAttendee(board.event.id, {
    name: "Lucía Sosa",
    checkedInAt: new Date(Date.now() - 2 * 60_000),
    checkinSource: "owu",
    checkinDevice: "Puerta 2",
  });
  await page.goto(`/admin/${board.community.slug}/attendees?event=${board.event.slug}`);
  const row = table(page).getByRole("row").filter({ hasText: "Lucía Sosa" });
  await expect(row).toContainText("Acreditado");

  await row.getByRole("button", { name: "Deshacer la acreditación de Lucía Sosa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Deshacer" }).click();

  await expect(row).toContainText("Por llegar");
});
