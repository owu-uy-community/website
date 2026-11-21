import { readFile } from "node:fs/promises";

import { makeEvent, makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { expectAccessible, HOUR, lastEmailTo, makeOrganizer, makePublishedEvent, makeRegistrations } from "./kit";

test("an editor approves someone from Por aprobar without seeing the whole list; they get their ticket", async ({
  pageFor,
  request,
}) => {
  const { community, organizer: editor } = await makeOrganizer("editor");
  const event = await makePublishedEvent(community.id, { approval: true });
  const [waiting] = await makeRegistrations(event.id, 1, { name: "Paula Pendiente", status: "pending" });

  const page = await pageFor(editor);
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=inscriptos`);
  await expect(page.getByText("Paula Pendiente")).toBeVisible();
  // No emails for editors: only names and answers
  await expect(page.getByText(waiting.email)).toBeHidden();
  await expectAccessible(page, { include: "main" });
  await page.getByRole("button", { name: "Aprobar a Paula Pendiente", exact: true }).click();
  await expect(page.getByText("Nadie espera tu aprobación")).toBeVisible();

  await lastEmailTo(request, waiting.email, `Estás anotado: ${event.name}`);
});

test("giving a seat never overbooks; bringing three in counts them and can be undone", async ({ pageFor }) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id, { startsIn: 3 * HOUR, capacity: 3 });
  await makeRegistrations(event.id, 3, { registeredAt: new Date(Date.now() - 2 * HOUR) });
  await makeRegistrations(event.id, 1, { name: "Walter Espera", status: "waitlisted" });

  const page = await pageFor(admin);
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=inscriptos`);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Walter Espera" })
    .getByRole("button", { name: "Dar lugar" })
    .click();
  await expect(page.getByText("No queda lugar: subí el cupo en Ajustes para darle uno")).toBeVisible();

  for (const name of ["Persona 1", "Persona 2", "Persona 3"]) {
    await page.getByRole("checkbox", { name: `Elegir a ${name}`, exact: true }).click();
  }
  await page
    .getByRole("toolbar", { name: "Acciones sobre la selección" })
    .getByRole("button", { name: "Hacer entrar" })
    .click();
  await expect(page.getByText("Entraron 3")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Entraron/ })).toContainText("3");

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByRole("button", { name: /^Entraron/ })).toContainText("0");
});

test("taking someone's place tells them; the CSV has its headers; search ignores accents", async ({
  pageFor,
  request,
}) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id);
  const [nunez] = await makeRegistrations(event.id, 1, { name: "Julia Núñez" });
  await makeRegistrations(event.id, 1, { name: "Pedro Otro" });
  // Another event's people never show up in this one's list or CSV
  const other = await makeEvent(community.id, { name: "Otro evento", status: "published", registration: "owu" });
  await makeRegistrations(other.id, 1, { name: "Ajeno Al Evento" });

  const page = await pageFor(admin);
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=inscriptos`);
  await page.getByPlaceholder("Nombre o email").fill("nunez");
  await expect(page.getByText("Julia Núñez")).toBeVisible();
  await expect(page.getByText("Pedro Otro")).toBeHidden();
  await page.getByPlaceholder("Nombre o email").fill("");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const csv = await readFile(await (await download).path(), "utf8");
  expect(csv.split("\r\n")[0]?.replace(/^﻿/, "")).toBe(
    "Nombre,Email,Entrada,Estado,Acreditación,Etiquetas,Acompañantes,Confirmó"
  );
  expect(csv).not.toContain("Ajeno Al Evento");

  await page.getByRole("button", { name: "Más acciones para Julia Núñez" }).click();
  await page.getByRole("menuitem", { name: "Dar de baja" }).click();
  await expect(page.getByRole("alertdialog").getByRole("button", { name: "Volver" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Dar de baja y avisar a 1 persona" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Julia Núñez" }).getByText("Dado de baja")).toBeVisible();

  await lastEmailTo(request, nunez.email, `Se canceló tu inscripción: ${event.name}`);
});
