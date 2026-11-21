import { call } from "@orpc/server";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test } from "vitest";

import { router } from "lib/orpc/router";
import { downModel } from "test/ai";
import { by } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin } from "test/factories";

/** A model that answers with `text` and keeps the prompt it got. */
function answering(text: string) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return Object.assign(model, { prompts });
}

describe("assistant.ask", () => {
  test("Owy answers from the event's live data", async () => {
    const { event } = await makeBoard();
    const model = answering("  Hay 0 acreditados de 0 inscriptos.  ");

    const result = await call(
      router.assistant.ask,
      { eventId: event.id, question: "¿Cuántos acreditados hay?" },
      by(await makeSiteAdmin(), { ai: { model: () => model, decisionModel: () => "unused" } })
    );

    expect(result).toStrictEqual({ answer: "Hay 0 acreditados de 0 inscriptos." });
    expect(model.prompts[0]).toContain(event.id);
    expect(model.prompts[0]).toContain("¿Cuántos acreditados hay?");
  });

  test("a gateway failure says so, and plain members can't ask", async () => {
    const { community, event } = await makeBoard();

    await expect(
      call(
        router.assistant.ask,
        { eventId: event.id, question: "¿Cómo viene el día?" },
        by(await makeSiteAdmin(), { ai: { model: () => downModel(), decisionModel: () => "unused" } })
      )
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    await expect(
      call(
        router.assistant.ask,
        { eventId: event.id, question: "¿Cómo viene el día?" },
        by(await makeMember(community.id, "member"))
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
