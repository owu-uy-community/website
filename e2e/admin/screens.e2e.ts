import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

/** Open a display and wait until the hub confirms it listens on `channel`. */
async function display(page: Page, path: string, channel: string) {
  const subscribed = new Promise<void>((resolve) => {
    page.on("websocket", (ws) => {
      if (ws.url().includes("/_next/")) return;
      ws.on("framereceived", (frame) => {
        if (String(frame.payload).includes(`"ch":"${channel}"`)) resolve();
      });
    });
  });
  await page.goto(path);
  await subscribed;

  return page;
}

test("a kiosk shows up in Pantallas, gets a name and shows it when identified", async ({ page, pageAs, board }) => {
  const kiosk = await display(
    await pageAs("anonymous"),
    `/comunidad/${board.community.slug}/events/${board.event.slug}/kiosk`,
    "screens"
  );
  // Its first beat lands in the background: read the list until it is there, then open the page.
  const listed = async () => {
    const response = await page.request.post("/api/orpc/screens/list", { data: { json: { eventId: board.event.id } } });
    return ((await response.json()) as { json: unknown[] }).json.length;
  };
  await expect.poll(listed).toBe(1);
  await page.goto(`/admin/${board.community.slug}/pantallas?event=${board.event.slug}`);

  const unnamed = page.getByRole("region", { name: "Pantalla sin nombre" });
  await expect(unnamed.getByText("Kiosco · grilla")).toBeVisible();
  await expect(page.getByText("1 de 1 en línea")).toBeVisible();
  await unnamed.getByRole("button", { name: "Renombrar" }).click();
  await page.getByRole("textbox", { name: "Nombre de la pantalla" }).fill("Kiosco · Lobby");
  await page.keyboard.press("Enter");

  const named = page.getByRole("region", { name: "Kiosco · Lobby" });
  await named.getByRole("button", { name: "Identificar" }).click();

  await expect(kiosk.getByRole("status").getByText("Kiosco · Lobby")).toBeVisible();
});
