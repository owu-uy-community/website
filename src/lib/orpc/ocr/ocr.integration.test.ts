import { call } from "@orpc/server";
import { http, HttpResponse } from "msw";
import { describe, expect, test, vi } from "vitest";

import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeSiteAdmin, makeUser } from "test/factories";
import { server } from "test/msw/server";

vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "gateway-test-key";
});

/** Every model behind the gateway is down. */
function modelsDown() {
  server.use(http.all("https://ai-gateway.vercel.sh/*", () => HttpResponse.json({ error: "down" }, { status: 503 })));
}

const board = {
  existingNotes: [{ title: "Ya agendada", room: "Sala A", timeSlot: "15:00 - 15:45" }],
  roomsWithResources: [
    { name: "Sala A", hasTV: false, hasWhiteboard: false },
    { name: "Sala TV", hasTV: true, hasWhiteboard: true },
  ],
  availableRooms: ["Sala A", "Sala TV"],
  availableTimeSlots: ["15:00 - 15:45", "16:00 - 16:45"],
};

describe("ocr", () => {
  test("with the models down, a slot is still offered, marked as degraded", async () => {
    modelsDown();
    const staff = await makeSiteAdmin();

    const suggestion = await call(
      router.ocr.findFreeSpot,
      { title: "Effect", speaker: "Ana", needsTV: false, needsWhiteboard: false, ...board },
      by(staff)
    );

    expect(suggestion).toMatchObject({ degraded: true, suggestedRoom: "Sala A", suggestedTimeSlot: "16:00 - 16:45" });
  });

  test("card reading and slot picking are staff-only", async () => {
    const user = await makeUser();

    await expect(
      call(router.ocr.processImage, { imageData: "data:image/png;base64,AAAA" }, by(user))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        router.ocr.findFreeSpot,
        { title: "X", speaker: "Y", needsTV: false, needsWhiteboard: false, ...board },
        by(null)
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test.fails("#12 a model outage while reading a card is a BAD_GATEWAY", async () => {
    modelsDown();
    const staff = await makeSiteAdmin();

    await expect(
      call(router.ocr.processImage, { imageData: "data:image/png;base64,AAAA" }, by(staff))
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  });

  test.fails("#P3 a photo larger than a request can carry is a BAD_REQUEST before any model is called", async () => {
    const staff = await makeSiteAdmin();
    const tooBig = `data:image/jpeg;base64,${"A".repeat(6_000_000)}`;

    await expect(call(router.ocr.processImage, { imageData: tooBig }, by(staff))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
