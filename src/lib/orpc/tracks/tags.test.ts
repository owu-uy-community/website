import { describe, expect, test, vi } from "vitest";

import { answeringModel, downModel } from "test/ai";

import { keywordTags, tagTrack } from "./tags";

describe(tagTrack, () => {
  test("keeps the model's topics that exist in the vocabulary, three at most, and its format", async () => {
    const model = answeringModel({ topics: ["ia", "datos", "inventado", "backend", "frontend"], format: "debate" });

    await expect(tagTrack(model, "Data e IA en producción")).resolves.toStrictEqual({
      topics: ["ia", "datos", "backend"],
      format: "debate",
    });
  });

  test("an unknown format is no format; no usable topic falls back to the keywords", async () => {
    const model = answeringModel({ topics: [], format: "keynote" });

    await expect(tagTrack(model, "Intro a Machine Learning")).resolves.toStrictEqual({ topics: ["ia"], format: null });
  });

  test("never throws: a provider that is down gets the keyword tags", async () => {
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined);

    await expect(
      tagTrack(downModel(), "Kubernetes para Devs", "K8s desde la perspectiva del developer")
    ).resolves.toStrictEqual(keywordTags("Kubernetes para Devs", "K8s desde la perspectiva del developer"));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
