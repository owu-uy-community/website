import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { E2E_AUTH_SECRET } from "../../playwright.config";
import { db } from "../../src/lib/db";
import { venueContacts, venueRequests } from "../../src/lib/db/schema";
import { signLink } from "../../src/lib/links";
import { makeCommunity, makeMember, makeVenue } from "../../src/test/factories";
import { expect, signedOut, test } from "../fixtures";
import { expectAccessible } from "./kit";

// The links are signed with the app's secret
process.env.BETTER_AUTH_SECRET = E2E_AUTH_SECRET;

const PHONE = { width: 390, height: 844 };

test("on a phone the host page asks consent unchecked and its heading fits the screen", async ({ browser }) => {
  const community = await makeCommunity({
    name: `Una comunidad con un nombre bastante largo ${createId().slice(0, 4)}`,
  });
  const organizer = await makeMember(community.id, "editor", { name: "Lucía Organiza" });
  const venue = await makeVenue({ name: `Casa de la Tecnología del Uruguay ${createId().slice(0, 4)}` });
  const [contact] = await db.select().from(venueContacts).where(eq(venueContacts.venueId, venue.id));
  const start = new Date("2029-11-26T22:00:00Z");
  const [request] = await db
    .insert(venueRequests)
    .values({
      venueId: venue.id,
      communityId: community.id,
      requestedById: organizer.id,
      options: [{ start: start.toISOString(), end: new Date(start.getTime() + 9_000_000).toISOString() }],
      expectedAttendees: 45,
      message: "La última del año, con brindis",
      expiresAt: new Date(Date.now() + 72 * 3_600_000),
    })
    .returning();
  const token = await signLink("venue-request", `${request.id}.${contact.id}`);

  // axe needs a context of its own, not browser.newPage()
  const context = await browser.newContext({
    storageState: signedOut,
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`/espacios/pedido/${token}`);

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText(venue.name);
  const box = await heading.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= PHONE.width).toBe(true);
  await expect(page.getByRole("checkbox", { name: "Compartir mi contacto con quien organiza" })).not.toBeChecked();
  await expectAccessible(page);

  // A forged link isn't a crash: it says to ask for another
  await page.goto(`/espacios/pedido/${token.slice(0, -4)}abcd`);
  await expect(page.getByText("Este link ya no sirve")).toBeVisible();
});
