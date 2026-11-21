import { db } from "../../src/lib/db";
import { communityMembers, outboundMessages, staffAnnouncements } from "../../src/lib/db/schema";
import { makeMember } from "../../src/test/factories";
import { expect, test } from "../fixtures";
import { swipe } from "../touch";

test("on a phone a swipe marks an announcement received, and cancels a scheduled message with a way back", async ({
  page,
  board,
  tenant,
}) => {
  const me = tenant.users.admin;
  await db.insert(communityMembers).values({ communityId: board.community.id, userId: me.id, role: "admin" });
  const author = await makeMember(board.community.id, "editor", { name: "Laura Autora" });
  await db.insert(staffAnnouncements).values({
    openSpaceId: board.event.id,
    authorId: author.id,
    body: "La fila llega a la puerta",
  });
  await db.insert(outboundMessages).values({
    eventId: board.event.id,
    channel: "telegram",
    body: "Mañana abrimos a las 14:30",
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
    createdById: me.id,
  });
  await page.goto(`/admin/${board.community.slug}/comunicacion?event=${board.event.slug}&tab=anuncios`);

  // Right on an announcement waiting for me: the same «Recibido» as its button.
  const card = page.locator("article", { hasText: "La fila llega a la puerta" });
  await expect(card.getByRole("button", { name: "Recibido" })).toBeVisible();
  await swipe(page, card, "right");
  await expect(card).toContainText("Lo vieron todos");
  await expect(card.getByRole("button", { name: "Recibido" })).toBeHidden();

  // Left on a scheduled message: cancelled, and «Deshacer» schedules it again.
  await page.getByRole("tab", { name: /^Owy/ }).click();
  const scheduled = page.locator("section").filter({ has: page.getByRole("heading", { name: "Programados" }) });
  const row = scheduled.getByRole("listitem").filter({ hasText: "Mañana abrimos" });
  await swipe(page, row, "left");
  await expect(row).toBeHidden();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(row).toBeVisible();
});
