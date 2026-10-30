import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { E2E_AUTH_SECRET } from "../../playwright.config";
import { db } from "../../src/lib/db";
import { venueContacts, venues } from "../../src/lib/db/schema";
import { signLink } from "../../src/lib/links";
import { makeUser, makeVenue } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import { expectAccessible } from "./kit";

// The links are signed with the app's secret
process.env.BETTER_AUTH_SECRET = E2E_AUTH_SECRET;

test("the yearly check: one tap keeps the space taking requests", async ({ browser }) => {
  const venue = await makeVenue({ name: `Oficina ${createId().slice(0, 6)}`, requestable: false });
  const [contact] = await db.select().from(venueContacts).where(eq(venueContacts.venueId, venue.id));
  const token = await signLink("venue-check", contact.id, new Date(Date.now() + 86_400_000));

  // axe needs a context of its own, not browser.newPage()
  const page = await (await browser.newContext({ storageState: signedOut })).newPage();
  await page.goto(`/espacios/seguimos/${token}`);
  await expect(page.getByRole("heading", { name: `¿${venue.name} sigue pudiendo recibir meetups?` })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Actualizar cómo es el espacio (opcional)" }).click();
  await page.getByRole("checkbox", { name: "Ascensor" }).click();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sí, seguimos" }).click();

  await expect(page.getByRole("status")).toContainText("Siguen recibiendo pedidos");
  await expect(db.select().from(venues).where(eq(venues.id, venue.id))).resolves.toMatchObject([
    { requestable: true, facts: { elevator: true } },
  ]);
});

test("/empresas/espacio says what hosting takes and gives, and its form passes axe", async ({ pageFor }) => {
  const page = await pageFor(await makeUser({ name: "Gerente de Oficina" }));
  await page.goto("/empresas/espacio");

  await expect(page.getByText("Qué hace falta")).toBeVisible();
  await expect(page.getByText("Qué reciben")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Entrada sin escalones" })).toBeVisible();
  // The page, not the site's navbar and footer around it
  await expectAccessible(page, { exclude: ["#site-menu", "footer"] });
});
