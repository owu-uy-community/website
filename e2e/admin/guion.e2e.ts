import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { outboundMessages, runOfShowItems } from "../../src/lib/db/schema";
import { expect, test } from "../fixtures";

test("GO starts the next moment, and Enter GOs the one after", async ({ page, board }) => {
  await db.insert(runOfShowItems).values([
    { eventId: board.event.id, position: 0, title: "Puertas", plannedStart: "14:30", durationMin: 30 },
    { eventId: board.event.id, position: 1, title: "Bienvenida", plannedStart: "15:00", durationMin: 15, fixed: true },
  ]);
  const row = (title: string) => page.getByRole("row").filter({ hasText: title });
  await page.goto(`/admin/${board.community.slug}/guion?event=${board.event.slug}`);
  await expect(row("Puertas")).toContainText("siguiente");

  await page.getByRole("button", { name: "GO: arrancar «Puertas»" }).click();

  await expect(row("Puertas")).toContainText("en curso");
  await expect(page.getByText("En curso · desde", { exact: false })).toBeVisible();
  await expect(row("Bienvenida")).toContainText("siguiente");

  // With nothing focused, Enter is GO.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");

  await expect(row("Bienvenida")).toContainText("en curso");
  await expect(row("Puertas")).toContainText("hecho");
});

test("a GO whose message Owy can't send says so in the same toast that offers Deshacer", async ({ page, board }) => {
  await db.insert(runOfShowItems).values({
    eventId: board.event.id,
    position: 0,
    title: "Puertas",
    plannedStart: "14:30",
    durationMin: 30,
    owyMessage: "Abrimos las puertas",
  });
  const row = page.getByRole("row").filter({ hasText: "Puertas" });
  await page.goto(`/admin/${board.community.slug}/guion?event=${board.event.slug}`);

  await page.getByRole("button", { name: "GO: arrancar «Puertas»" }).click();

  // Telegram isn't configured here: the GO stands, the toast says what didn't go out, and the log has it as failed.
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "GO · Puertas" });
  await expect(toast).toContainText("Owy no pudo avisar");
  await expect(row).toContainText("en curso");
  await expect
    .poll(
      async () =>
        (await db.select().from(outboundMessages).where(eq(outboundMessages.eventId, board.event.id)))[0]?.status
    )
    .toBe("failed");

  await toast.getByRole("button", { name: "Deshacer" }).click();

  await expect(row).toContainText("siguiente");
});
