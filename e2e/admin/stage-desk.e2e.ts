import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

// The wall and the desk are one global row: these take turns.
test.describe.configure({ mode: "serial" });

const DESK = "/admin/owy/scenes";

const rpc = (page: Page, path: string, json: unknown) =>
  page.request.post(`/api/orpc/owyStage/${path}`, { data: { json } });

/** Empty desk, and `message` on air with this title. */
async function reset(page: Page, title: string) {
  await rpc(page, "saveDesk", { desk: { preview: null, queue: [], presets: [] } });
  await rpc(page, "setScene", { scene: "message", params: { title }, restart: true });
}

/** Open a page and wait until the hub confirms its subscription to `channel`. */
async function follow(page: Page, path: string, channel: string) {
  // Listen from the socket's first frame on (the ack can beat a later listener). Under
  // `next dev` one socket is HMR's; the realtime one is the other.
  // `next dev` floats its issue badge over the bottom-left corner, right where a phone's tab bar is.
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    })
  );
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

test("a title typed key by key keeps its spaces, on the preview monitor too", async ({ page }) => {
  await reset(page, "Antes");
  await follow(page, DESK, "private:owy-desk");
  await page.getByRole("button", { name: "Mensaje: a la preview" }).first().click();
  const title = page.locator("#param-preview-title");
  await title.fill("");
  await title.pressSequentially("Ya volvemos en cinco", { delay: 40 });

  await expect(title).toHaveValue("Ya volvemos en cinco");
  await expect(page.frameLocator('iframe[title="Preview"]').getByText("Ya volvemos en cinco")).toBeVisible();
});

test("a raffle with a single name lands on it and celebrates", async ({ page, pageAs }) => {
  await rpc(page, "setScene", { scene: "raffle", params: { names: "Ana Pérez", winner: "Ana Pérez" }, restart: true });
  const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");

  // Each scene's code loads on first use, which a cold `next dev` compiles on the spot.
  await expect(wall.getByText("¡Felicitaciones!")).toBeVisible({ timeout: 45_000 });
  // The name lands in place of its spinning copy: for a moment both are there.
  await expect(wall.getByText("Ana Pérez").first()).toBeVisible();
});

test("a second admin device sees the same queue", async ({ page, pageAs }) => {
  await reset(page, "Antes");
  const tablet = await follow(await pageAs("admin"), DESK, "private:owy-desk");
  await follow(page, DESK, "private:owy-desk");

  await page.getByRole("button", { name: "Agregar Countdown a la cola" }).first().click();

  await expect(tablet.getByRole("region", { name: "Cola" }).getByText("Countdown", { exact: true })).toBeVisible();
});

test("a preview saved as a preset comes back on key 1, and Shift+1 puts it on air", async ({ page, pageAs }) => {
  await reset(page, "Antes");
  const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");
  await follow(page, DESK, "private:owy-desk");

  await page.getByRole("button", { name: "Mensaje: a la preview" }).first().click();
  await page.locator("#param-preview-title").fill("Volvemos en 10");
  await page.getByRole("button", { name: "Guardar preset" }).click();
  // The name it proposes is what the preview says.
  await expect(page.getByLabel("Nombre del preset")).toHaveValue("Volvemos en 10");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("tab", { name: /^Presets/ }).click();
  await expect(page.getByRole("button", { name: "Volvemos en 10: a la preview" })).toBeVisible();

  await page.getByRole("button", { name: "Sacar de la preview" }).click();
  await page.keyboard.press("1");
  await expect(page.locator("#param-preview-title")).toHaveValue("Volvemos en 10");
  await expect(wall.getByText("Antes")).toBeVisible();
  await page.keyboard.press("Shift+Digit1");

  await expect(wall.getByText("Volvemos en 10")).toBeVisible();
});

test("a question hidden from the desk leaves the wall, the others stay", async ({ page, pageAs }) => {
  await rpc(page, "saveDesk", { desk: { preview: null, queue: [], presets: [] } });
  const taken = await rpc(page, "setScene", { scene: "live-questions", params: { title: "Q&A" }, restart: true });
  const { round } = ((await taken.json()) as { json: { round: string } }).json;
  const ask = (value: string, voter: string) =>
    page.request.post("/api/orpc/owyStage/submit", {
      data: { json: { round, key: "question", value, voter, mode: "multi" } },
    });
  await ask("¿Cómo escalan el open space?", "tel-1");
  await ask("compren mi curso", "tel-2");
  const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");
  await expect(wall.getByText("compren mi curso")).toBeVisible();
  await follow(page, DESK, "private:owy-desk");

  await page.getByRole("button", { name: "Editar lo que está al aire" }).click();
  await page
    .getByRole("region", { name: "Preguntas" })
    .getByRole("listitem")
    .filter({ hasText: "compren mi curso" })
    .getByRole("button", { name: "Ocultar de la pared" })
    .click();

  await expect(wall.getByText("compren mi curso")).toBeHidden();
  await expect(wall.getByText("¿Cómo escalan el open space?")).toBeVisible();
});

test.describe("from a phone", () => {
  test.use({ viewport: { width: 393, height: 760 }, isMobile: true, hasTouch: true });

  test("pick, edit and TAKE a scene from the bottom tabs", async ({ page, pageAs }) => {
    await reset(page, "Antes");
    const wall = await follow(await pageAs("anonymous"), "/owy/stage", "owy-stage");
    await follow(page, DESK, "private:owy-desk");

    await page.getByRole("button", { name: "Escenas", exact: true }).click();
    await page.getByRole("button", { name: "Mensaje: a la preview" }).first().click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.locator("#param-preview-title").fill("Desde el celular");
    await page.getByRole("button", { name: "TAKE: la preview sale al aire" }).click();

    await expect(wall.getByText("Desde el celular")).toBeVisible();
  });

  test("a preset tapped in its tab lands in preview, ready to edit", async ({ page }) => {
    await reset(page, "Antes");
    const presets = [{ id: "b", name: "Almuerzo", scene: "message", params: { title: "Almuerzo en el patio" } }];
    await rpc(page, "saveDesk", { desk: { preview: null, queue: [], presets } });
    await follow(page, DESK, "private:owy-desk");

    await page.getByRole("button", { name: "Presets", exact: true }).click();
    await page.getByRole("button", { name: "Almuerzo: a la preview" }).click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();

    await expect(page.locator("#param-preview-title")).toHaveValue("Almuerzo en el patio");
    // The editor knows which preset this is.
    await expect(page.getByRole("button", { name: "Almuerzo", exact: true })).toBeVisible();
  });

  test("a long-press on a scene opens its menu, lifting the finger picks nothing, its actions work", async ({
    page,
  }) => {
    await reset(page, "Antes");
    await follow(page, DESK, "private:owy-desk");
    await page.getByRole("button", { name: "Escenas", exact: true }).click();
    const card = page.getByRole("button", { name: "Mensaje: a la preview" }).first();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // A held finger that drifts a little, as a real one does: Playwright only taps, so through CDP.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    for (const dx of [3, -3, 3, -3, 3, -3, 3, -3, 3]) {
      await page.waitForTimeout(100);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x + dx, y: at.y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    // Lifting the finger over the menu picks nothing (its first item is «Al aire ya»).
    await expect(page.getByRole("menuitem", { name: "Al aire ya" })).toBeVisible();
    const live = (await (await rpc(page, "getState", {})).json()) as { json: { scene: string } };
    expect(live.json.scene).toBe("message");
    await page.getByRole("menuitem", { name: "Agregar a la cola" }).click();

    await expect(page.getByRole("button", { name: "Cola, 1" })).toBeVisible();
  });

  test("after TAKEs from the phone, the queue lists exactly what is waiting", async ({ page }) => {
    await reset(page, "Antes");
    await rpc(page, "saveDesk", {
      desk: {
        preview: { id: "p1", scene: "logo", params: {}, from: "pick" },
        queue: ["countdown", "clock", "agenda"].map((scene, i) => ({ id: `q${i}`, scene, params: {}, from: "queue" })),
        presets: [],
      },
    });
    await follow(page, DESK, "private:owy-desk");
    await page.getByRole("button", { name: "Escenas", exact: true }).click();
    const take = page.getByRole("button", { name: "TAKE: la preview sale al aire" });
    await take.click();
    await expect(take).toBeEnabled();
    await take.click();
    await expect(take).toBeEnabled();
    await page.getByRole("button", { name: /^Cola/ }).click();
    const queue = page.getByRole("region", { name: "Cola" });

    await expect(queue.getByRole("listitem")).toHaveCount(1);
    await expect(queue.getByText("Agenda", { exact: true })).toBeVisible();
  });

  test("a queued scene swiped left leaves the queue, and Deshacer brings it back", async ({ page }) => {
    await reset(page, "Antes");
    await rpc(page, "saveDesk", {
      desk: { preview: null, queue: [{ id: "q1", scene: "countdown", params: {}, from: "queue" }], presets: [] },
    });
    await follow(page, DESK, "private:owy-desk");
    await page.getByRole("button", { name: /^Cola/ }).click();
    const queue = page.getByRole("region", { name: "Cola" });
    const box = (await queue.getByText("Countdown", { exact: true }).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(queue.getByText("Nada en espera")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();

    await expect(queue.getByText("Countdown", { exact: true })).toBeVisible();
  });
});
