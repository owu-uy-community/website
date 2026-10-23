import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { attendees } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import {
  DAY,
  expectAccessible,
  HOUR,
  lastEmailTo,
  linkIn,
  makeOrganizer,
  makePublishedEvent,
  makeRegistrations,
  runTick,
} from "./kit";

const confirmedAt = async (id: string) =>
  (await db.select({ at: attendees.confirmedAt }).from(attendees).where(eq(attendees.id, id)))[0]?.at ?? null;

test("Voy from the 48 h reminder: the link opens a page that asks, the button confirms, Inscriptos shows it", async ({
  browser,
  pageFor,
  request,
}) => {
  const { community } = await makeOrganizer();
  const admin = await makeMember(community.id, "admin");
  const event = await makePublishedEvent(community.id, { startsIn: 40 * HOUR, capacity: 10 });
  const [ana] = await makeRegistrations(event.id, 1, {
    name: "Ana Confirma",
    registeredAt: new Date(Date.now() - 3 * DAY),
  });

  await runTick(request);
  const reminder = await lastEmailTo(request, ana.email, `Pasado mañana: ${event.name}`);

  const attendee = await (await browser.newContext({ storageState: signedOut })).newPage();
  await attendee.goto(linkIn(reminder, "accion=confirmar"));
  await expect(attendee.getByText("¿Seguís viniendo? Confirmalo con un toque.")).toBeVisible();
  // Opening the link changes nothing: only the button does
  expect(await confirmedAt(ana.id)).toBeNull();
  await expectAccessible(attendee, { include: "main" });
  await attendee.getByRole("button", { name: "Voy ✅" }).click();
  await expect(attendee.getByText(/· confirmaste/)).toBeVisible();

  const panel = await pageFor(admin);
  await panel.goto(`/organizar/panel/${community.slug}/eventos/${event.id}?tab=inscriptos`);
  const row = panel.getByRole("listitem").filter({ hasText: "Ana Confirma" });
  await expect(row.getByText("Confirmó")).toBeVisible();
});

test("No puedo ir from the reminder frees the seat: the waitlist gets the offer by mail", async ({
  browser,
  request,
}) => {
  const { community } = await makeOrganizer();
  const event = await makePublishedEvent(community.id, { startsIn: 40 * HOUR, capacity: 1 });
  const [beto] = await makeRegistrations(event.id, 1, {
    name: "Beto Libera",
    registeredAt: new Date(Date.now() - 3 * DAY),
  });
  const [caro] = await makeRegistrations(event.id, 1, { name: "Caro Espera", status: "waitlisted" });

  await runTick(request);
  const reminder = await lastEmailTo(request, beto.email, `Pasado mañana: ${event.name}`);
  expect(reminder.text).toContain("Hay 1 persona en lista de espera");

  const page = await (await browser.newContext({ storageState: signedOut })).newPage();
  await page.goto(linkIn(reminder, "accion=liberar"));
  await expect(
    page.getByText(/Hay 1 persona en lista de espera: si no podés, tu lugar pasa a la siguiente/)
  ).toBeVisible();
  await page.getByRole("button", { name: "Liberar mi lugar" }).click();
  await expect(page.getByText("Liberaste tu lugar")).toBeVisible();

  await runTick(request);
  await lastEmailTo(request, caro.email, `Se liberó un lugar en ${event.name}`);
});
