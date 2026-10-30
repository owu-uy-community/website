import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { eventMessages } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import {
  expectAccessible,
  lastEmailTo,
  mailbox,
  makeOrganizer,
  makePublishedEvent,
  makeRegistrations,
  runTick,
} from "./kit";

test("the composer previews the mail, tests it on the organizer, and sends with a count and a way back", async ({
  pageFor,
  request,
}) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id);
  const [ana] = await makeRegistrations(event.id, 2);

  const page = await pageFor(admin);
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=emails`);
  await page.getByLabel("Asunto").fill("Cambió la sala");
  await page.getByLabel("Mensaje").fill("Nos vemos en la sala 2, mismo horario de siempre.");

  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(
    page.frameLocator('iframe[title="Vista previa del mail"]').locator("p", { hasText: "Nos vemos en la sala 2" })
  ).toBeVisible();
  await expectAccessible(page, { include: "main", exclude: ["iframe"] });

  await page.getByRole("button", { name: "Mandarme una prueba" }).first().click();
  await lastEmailTo(request, admin.email, `[Prueba] Cambió la sala · ${event.name}`);
  expect((await mailbox(request, ana.email)).some((message) => message.subject.startsWith("Cambió la sala"))).toBe(
    false
  );

  await page.getByRole("button", { name: "Mandar a 2 personas" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Mandar a 2 personas" }).click();
  await dialog.getByRole("button", { name: "Mandar a 2 personas" }).click();

  await lastEmailTo(request, ana.email, `Cambió la sala · ${event.name}`);
  await expect(page.getByRole("list", { name: "Mensajes del evento" })).toContainText("Cambió la sala");
});

test("a scheduled message shows in the log and goes out when the tick finds it due", async ({ pageFor, request }) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id);
  const [ana] = await makeRegistrations(event.id, 1);

  const page = await pageFor(admin);
  await page.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=emails`);
  await page.getByLabel("Asunto").fill("Mañana: traé la notebook");
  await page.getByLabel("Mensaje").fill("Va a haber un taller práctico, traé la notebook cargada.");
  await page.getByRole("switch", { name: "Programar el envío" }).click();
  await page.getByRole("button", { name: /^Programar para el/ }).click();

  const log = page.getByRole("list", { name: "Mensajes del evento" });
  await expect(log.getByRole("listitem").filter({ hasText: "Mañana: traé la notebook" })).toContainText("Programado");

  // Its time comes (the tick runs every 5 minutes; here, now)
  await db
    .update(eventMessages)
    .set({ sendAt: new Date(Date.now() - 60_000) })
    .where(eq(eventMessages.eventId, event.id));
  await runTick(request);
  await lastEmailTo(request, ana.email, `Mañana: traé la notebook · ${event.name}`);
  await page.reload();
  await expect(log.getByRole("listitem").filter({ hasText: "Mañana: traé la notebook" })).toContainText("Enviado");
});
