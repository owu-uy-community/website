import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { staffTaskAssignments, staffTasks } from "../../src/lib/db/schema";
import { wallClock } from "../../src/lib/slot-day";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";

/** The page is hydrated and its socket is open: what it shows from here on is live. */
const live = (page: Page) => expect(page.getByText("Tiempo real")).toBeVisible();

test("an organizer drags a person onto another and they trade tasks; Deshacer trades them back", async ({
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
  const montaje = await task("Montaje", "00:00", ana.id);
  const puerta = await task("Puerta", "00:01", beto.id);
  const seatOf = async (userId: string) =>
    (await db.select().from(staffTaskAssignments).where(eq(staffTaskAssignments.userId, userId)))[0]?.taskId;

  await page.goto(`/admin/${board.community.slug}/tareas?event=${board.event.slug}`);
  await live(page);
  const card = (title: string) =>
    page.locator("article").filter({ has: page.getByRole("button", { name: title, exact: true }) });
  // A person's chip; its title also says how they are ("· no llegó").
  const chip = (title: string, name: string) => card(title).getByRole("listitem", { name: new RegExp(`^${name}`) });

  const from = (await chip("Montaje", "Ana Pérez").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
  // Measured once the drag is on: starting one near an edge can scroll the page.
  const to = (await chip("Puerta", "Beto Gómez").boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText("Intercambiaste a Ana y Beto")).toBeVisible();
  await expect(chip("Montaje", "Beto Gómez")).toBeVisible();
  await expect(chip("Puerta", "Ana Pérez")).toBeVisible();
  await expect.poll(() => seatOf(ana.id)).toBe(puerta.id);

  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(chip("Montaje", "Ana Pérez")).toBeVisible();
  await expect.poll(() => seatOf(ana.id)).toBe(montaje.id);
  await expect.poll(() => seatOf(beto.id)).toBe(puerta.id);
});
