import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Route } from "@playwright/test";

import type { CardEvent } from "../../src/lib/orpc/ocr/schemas";
import { expect, test } from "../fixtures";

// A fake camera: Chromium's synthetic video stands in for the card.
test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

/**
 * Answers ocr.extractCard with canned events, encoded by oRPC itself so the
 * test speaks the real wire format. No model is called.
 */
function answerCardWith(events: CardEvent[]) {
  const handler = new RPCHandler({
    ocr: {
      extractCard: os.handler(async function* () {
        for (const event of events) yield event;
      }),
    },
  });

  return async (route: Route) => {
    const request = route.request();
    const { response } = await handler.handle(
      new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }),
      { prefix: "/api/orpc", context: {} }
    );

    await route.fulfill({
      status: response?.status ?? 500,
      headers: Object.fromEntries(response?.headers ?? []),
      body: await response?.text(),
    });
  };
}

test("a card photo fills the form as it is read, then a place is suggested", async ({ page, board }) => {
  await page.route(
    "**/api/orpc/ocr/extractCard",
    answerCardWith([
      { type: "fields", fields: { speaker: "Ana" } },
      { type: "fields", fields: { speaker: "Ana", title: "Effect" } },
      {
        type: "card",
        card: { title: "Effect", speaker: "Ana", needsTV: true, needsWhiteboard: false, requisito: "tv", revisar: [] },
      },
      {
        type: "suggestion",
        suggestion: {
          suggestedRoom: board.rooms.tv.name,
          suggestedTimeSlot: "16:00 - 16:45",
          reasoning: "La única sala con TV, en el bloque más libre.",
          alternatives: [],
        },
      },
    ])
  );
  await page.goto(board.url);

  await page.getByRole("button", { name: "Charla", exact: true }).click();
  await page.getByRole("tab", { name: "OCR" }).click();
  await page.getByRole("button", { name: "Iniciar cámara" }).click();
  await page.getByRole("button", { name: "Capturar" }).click();
  await page.getByRole("button", { name: "Extraer datos" }).click();

  await expect(page.getByLabel("Título")).toHaveValue("Effect");
  await expect(page.getByLabel("Orador (opcional)")).toHaveValue("Ana");
  await expect(page.locator("#room")).toHaveText(board.rooms.tv.name);
  await expect(page.locator("#timeSlot")).toHaveText("16:00 - 16:45");
  await page.getByRole("button", { name: "Razonamiento de la AI" }).click();
  await expect(page.getByText("La única sala con TV, en el bloque más libre.")).toBeVisible();
});
