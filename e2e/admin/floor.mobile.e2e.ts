import type { Locator, Page } from "@playwright/test";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { incidents, staffTaskAssignments, staffTasks } from "../../src/lib/db/schema";
import { wallClock } from "../../src/lib/slot-day";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

/** The page is hydrated and its socket is open: what it shows from here on is live. */
const live = (page: Page) => expect(page.getByText("Tiempo real")).toBeVisible();

/**
 * A finger, through the browser's own touch handling: press at `from`, hold `holdMs`, move to `to` in steps,
 * lift. Points are a locator's centre or [x, y].
 */
async function finger(page: Page, from: Locator | [number, number], to: Locator | [number, number], holdMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  const point = async (target: Locator | [number, number]) => {
    if (Array.isArray(target)) return { x: target[0], y: target[1] };
    const box = (await target.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const a = await point(from);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
  if (holdMs) await page.waitForTimeout(holdMs);
  // Where the target is once the finger is down: a drag that starts can scroll the page.
  const b = await point(to);
  for (let step = 1; step <= 14; step += 1) {
    const x = a.x + ((b.x - a.x) * step) / 14;
    const y = a.y + ((b.y - a.y) * step) / 14;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("a member swipes an incident right to take it and left to resolve it, and Deshacer reopens it", async ({
  pageAs,
  tenant,
}) => {
  const title = `Se perdió una mochila ${createId().slice(0, 6)}`;
  const [incident] = await db
    .insert(incidents)
    .values({
      eventId: tenant.event.id,
      title,
      category: "lost",
      severity: "low",
      reporterId: tenant.users.editor.id,
      source: "phone",
    })
    .returning();
  const status = async () =>
    (await db.select({ status: incidents.status }).from(incidents).where(eq(incidents.id, incident.id)))[0]?.status;

  const phone = await pageAs("member");
  await phone.goto(`/admin/${tenant.community.slug}/incidentes?event=${tenant.event.slug}`);
  await live(phone);
  const row = phone.getByRole("button", { name: new RegExp(title) });
  const sideways = async (dx: number) => {
    // A row a swipe let go of springs back first: touch it where it rests.
    let lastX = Number.NaN;
    await expect
      .poll(
        async () => {
          const x = (await row.boundingBox())!.x;
          const settled = Math.abs(x - lastX) < 0.5;
          lastX = x;
          return settled;
        },
        { intervals: [100] }
      )
      .toBe(true);
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const x = dx > 0 ? box.x + 40 : box.x + box.width - 40;
    await finger(phone, [x, y], [x + dx, y]);
  };

  await sideways(160);
  await expect(phone.getByText("Es tuyo")).toBeVisible();
  await expect(row).toContainText("En curso");
  await expect(row).toContainText(tenant.users.member.name.split(" ")[0]);
  await expect.poll(status).toBe("in_progress");

  await sideways(-160);
  await expect(phone.getByText("Lo resolviste")).toBeVisible();
  await expect(row).toBeHidden();
  await expect.poll(status).toBe("resolved");

  await phone.getByRole("button", { name: "Deshacer" }).tap();
  await expect(row).toBeVisible();
  await expect.poll(status).toBe("in_progress");
});

test("an organizer long-presses a person and drops them on someone else's card: they trade tasks", async ({
  page,
  board,
}) => {
  const today = wallClock(new Date(), board.event.timezone).slice(0, 10);
  const [ana, beto] = await Promise.all([
    makeMember(board.community.id, "member", { name: "Ana Pérez" }),
    makeMember(board.community.id, "member", { name: "Beto Gómez" }),
  ]);
  const task = async (title: string, startTime: string, userId: string) => {
    const [row] = await db
      .insert(staffTasks)
      .values({
        openSpaceId: board.event.id,
        title,
        dayDate: new Date(`${today}T00:00:00.000Z`),
        startTime,
        endTime: "23:59",
      })
      .returning();
    await db.insert(staffTaskAssignments).values({ taskId: row.id, userId });
    return row;
  };
  await task("Montaje", "00:00", ana.id);
  const puerta = await task("Puerta", "00:01", beto.id);

  await page.goto(`/admin/${board.community.slug}/tareas?event=${board.event.slug}`);
  await live(page);
  const card = (title: string) =>
    page.locator("article").filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await card("Puerta").scrollIntoViewIfNeeded();

  // Held still first: on touch a drag starts only after a moment, so a finger that moves at once scrolls.
  await finger(
    page,
    card("Montaje").getByRole("listitem", { name: /^Ana Pérez/ }),
    card("Puerta").getByRole("listitem", { name: /^Beto Gómez/ }),
    450
  );

  await expect(page.getByText("Intercambiaste a Ana y Beto")).toBeVisible();
  await expect(card("Puerta").getByRole("listitem", { name: /^Ana Pérez/ })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db.select().from(staffTaskAssignments).where(eq(staffTaskAssignments.userId, ana.id)))[0]?.taskId
    )
    .toBe(puerta.id);
});
