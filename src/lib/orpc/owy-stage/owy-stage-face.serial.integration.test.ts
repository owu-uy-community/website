import { call } from "@orpc/server";
import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { router } from "lib/orpc/router";
import { hub } from "lib/realtime/hub";
import { by, type RouterInputs } from "test/context";
import { makeSiteAdmin } from "test/factories";

/** The wall is one global row, so every test starts with nothing on air. */
async function setup() {
  await db.execute(sql`TRUNCATE owy_stage_state, owy_stage_inputs CASCADE`);
  const staff = await makeSiteAdmin();
  // Loosely typed on purpose: two tests send what the schema must reject.
  const face = (input: RouterInputs["owyStage"]["setFace"] | Record<string, unknown>) =>
    call(router.owyStage.setFace, input as RouterInputs["owyStage"]["setFace"], by(staff));

  return { staff, face };
}

const card = { title: "Effect en producción", speaker: "Ana", room: "Cueva", timeSlot: "15:00 - 15:45" };

describe("Owy's face on the wall", () => {
  test("a feeling, a card and a whole pitch transcript are broadcast as they are", async () => {
    const { face } = await setup();
    const publish = vi.spyOn(hub, "publish");
    const transcript = { who: "input", text: "Quiero proponer ".repeat(90).trim() };

    await face({ state: "listening", transcript });
    await face({ state: "speaking", expression: { name: "surprised", strength: 70 } });
    await face({ state: "happy", card });

    expect(transcript.text.length).toBeGreaterThan(1000);
    expect(publish).toHaveBeenCalledWith("owy-stage", "face", expect.objectContaining({ transcript }));
    expect(publish).toHaveBeenCalledWith(
      "owy-stage",
      "face",
      expect.objectContaining({ expression: { name: "surprised", strength: 70 } })
    );
    expect(publish).toHaveBeenCalledWith("owy-stage", "face", expect.objectContaining({ card }));
  });

  test("a transcript past 2000 characters and an unknown feeling are BAD_REQUEST", async () => {
    const { face } = await setup();

    await expect(
      face({ state: "listening", transcript: { who: "input", text: "a".repeat(2001) } })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(face({ state: "speaking", expression: { name: "bored", strength: 50 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("the last state and card are kept for a wall that connects late; the transcript is not", async () => {
    const { staff, face } = await setup();
    const before = await call(router.owyStage.setScene, { scene: "logo" }, by(staff));

    await face({ state: "listening", source: "owy-knob" });
    await face({ state: "listening", transcript: { who: "input", text: "Quiero proponer una charla" } });
    await face({ state: "happy", card, source: "owy-knob" });
    const state = await call(router.owyStage.getState, undefined, by(null));

    expect(state.face).toStrictEqual({ state: "happy", card, source: "owy-knob", at: expect.any(String) });
    expect(state.round).toBe(before.round);
    expect(state.takenAt).toBe(before.takenAt);
  });

  test("a transcript-only post does not overwrite the kept face", async () => {
    const { face } = await setup();

    await face({ state: "happy", card });
    await face({ state: "speaking", transcript: { who: "output", text: "Queda en Cueva" } });
    const state = await call(router.owyStage.getState, undefined, by(null));

    expect(state.face).toMatchObject({ state: "happy", card });
  });
});
