import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

// The wall and the desk are one global row: these take turns.
test.describe.configure({ mode: "serial" });

const DESK = "/admin/owy/scenes";

const rpc = (page: Page, path: string, json: unknown) =>
  page.request.post(`/api/orpc/owyStage/${path}`, { data: { json } });

/** Empty desk, and `message` on air with this title. */
async function reset(page: Page, title: string) {
  await rpc(page, "saveDesk", { desk: { preview: null, queue: [], favorites: [] } });
  await rpc(page, "setScene", { scene: "message", params: { title }, restart: true });
}

/** Open a page and wait until the hub confirms its subscription to `channel`. */
async function follow(page: Page, path: string, channel: string) {
  // Listen from the socket's first frame on (the ack can beat a later listener). Under
  // `next dev` one socket is HMR's; the realtime one is the other.
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

test("a scene waits in preview until TAKE, then the queue moves up", async ({ page, pageAs }) => {
  await reset(page, "Antes");
  const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");
  await follow(page, DESK, "private:owy-desk");

  await page.getByRole("button", { name: "Mensaje: a la preview" }).first().click();
  await page.locator("#param-preview-title").fill("Ya volvemos");
  await page.getByRole("button", { name: "Agregar Logo OWU CONF a la cola" }).click();
  await expect(page.getByRole("region", { name: "Cola" }).getByText("Logo OWU CONF")).toBeVisible();
  // Prepared, not shown: the wall still has what was on air.
  await expect(wall.getByText("Antes")).toBeVisible();

  await page.getByRole("button", { name: "TAKE: la preview sale al aire" }).click();

  await expect(wall.getByText("Ya volvemos")).toBeVisible();
  await expect(page.getByRole("region", { name: "Parámetros" }).getByText("Logo OWU CONF").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Cola" }).getByText("Nada en espera")).toBeVisible();
});

test("with nothing queued, Space twice is a TAKE and its undo", async ({ page, pageAs }) => {
  await reset(page, "Antes");
  const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");
  await follow(page, DESK, "private:owy-desk");
  await page.getByRole("button", { name: "Mensaje: a la preview" }).first().click();
  await page.locator("#param-preview-title").fill("Después");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press(" ");
  await expect(wall.getByText("Después")).toBeVisible();
  // A press while a TAKE is still on its way is ignored on purpose (a double press must not
  // send the next scene too): wait for the button to come back, as an operator would.
  await expect(page.getByRole("button", { name: "TAKE: la preview sale al aire" })).toBeEnabled();
  await page.keyboard.press(" ");

  await expect(wall.getByText("Antes")).toBeVisible();
});

test("a second admin device sees the same queue", async ({ page, pageAs }) => {
  await reset(page, "Antes");
  const tablet = await follow(await pageAs("admin"), DESK, "private:owy-desk");
  await follow(page, DESK, "private:owy-desk");

  await page.getByRole("button", { name: "Agregar Countdown a la cola" }).first().click();

  await expect(tablet.getByRole("region", { name: "Cola" }).getByText("Countdown", { exact: true })).toBeVisible();
});
