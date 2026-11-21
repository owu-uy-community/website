import { and, eq, isNotNull } from "drizzle-orm";

import { E2E_AUTH_SECRET } from "../../playwright.config";
import { db } from "../../src/lib/db";
import { attendees, attendeeScans } from "../../src/lib/db/schema";
import { signLink } from "../../src/lib/links";
import { makeCommunity } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import { DAY, expectAccessible, HOUR, makePublishedEvent, makeRegistrations } from "./kit";

// Door links are signed with the app's secret; the spec signs one the way events.doorLink does
process.env.BETTER_AUTH_SECRET ??= E2E_AUTH_SECRET;

async function doorFor(startsIn = -0.5 * HOUR) {
  const community = await makeCommunity({ name: "Comunidad en la puerta" });
  const event = await makePublishedEvent(community.id, { startsIn, hours: 3 });
  const token = await signLink("door", `${event.id}.${event.doorVersion}`, new Date(Date.now() + DAY));

  return { event, url: `/puerta/${token}` };
}

test("on a phone, a name search shows at least three people; who's in reads Ya entró, with nothing to press", async ({
  browser,
}) => {
  const { event, url } = await doorFor();
  for (const name of ["Ana Uno", "Ana Dos", "Ana Tres", "Ana Cuatro"]) {
    await makeRegistrations(event.id, 1, { name });
  }
  await makeRegistrations(event.id, 1, {
    name: "Ana Adentro",
    checkedInAt: new Date(Date.now() - 10 * 60_000),
    checkinSource: "owu",
  });

  const page = await (await browser.newContext({ storageState: signedOut })).newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Puerta" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByLabel("Buscar por nombre").fill("ana");

  const results = page.getByRole("list", { name: "Resultados" }).getByRole("listitem");
  await expect(results).toHaveCount(5);
  let visible = 0;
  for (const row of await results.all()) {
    const box = await row.boundingBox();
    if (box && box.y + box.height <= 844) visible += 1;
  }
  expect(visible).toBeGreaterThanOrEqual(3);

  const inside = results.filter({ hasText: "Ana Adentro" });
  await expect(inside).toContainText(/Ya entró \d{2}:\d{2}/);
  await expect(inside.getByRole("button")).toHaveCount(0);
});

test("without signal, three scans wait in a queue and each lets its person in once when it's back", async ({
  browser,
}) => {
  const { event, url } = await doorFor();
  const people = await makeRegistrations(event.id, 3);

  const context = await browser.newContext({ storageState: signedOut });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Código", exact: true }).click();

  await context.setOffline(true);
  for (const person of people) {
    await page.getByLabel("El número debajo del QR de la entrada").fill(person.barcode ?? "");
    await page.getByLabel("El número debajo del QR de la entrada").press("Enter");
    await expect(page.getByText("Guardado para mandar después")).toBeVisible();
    await page.getByText("Tocá para seguir").click();
  }
  await expect(page.getByText("3 en cola")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Se mandaron 3 escaneos sin señal")).toBeVisible();

  const inside = await db
    .select({ id: attendees.id })
    .from(attendees)
    .where(and(eq(attendees.eventId, event.id), isNotNull(attendees.checkedInAt)));
  expect(inside).toHaveLength(3);
  const scans = await db.select().from(attendeeScans).where(eq(attendeeScans.eventId, event.id));
  expect(scans.map((scan) => scan.result)).toStrictEqual(["ok", "ok", "ok"]);
});
