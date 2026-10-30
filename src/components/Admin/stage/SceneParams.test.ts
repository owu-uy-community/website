import { describe, expect, test } from "vitest";

import { SCENES } from "lib/owy-stage/scenes";

import { PARAM_LABELS, labelFor } from "./SceneParams";

describe("scene param labels", () => {
  test("every param of every scene has a Spanish label", () => {
    const missing = Object.entries(SCENES).flatMap(([id, scene]) =>
      Object.keys((scene.params as unknown as { shape?: Record<string, unknown> }).shape ?? {})
        .filter((key) => !(key in PARAM_LABELS))
        .map((key) => `${id}.${key}`)
    );

    expect(missing).toStrictEqual([]);
  });

  test("a key nobody named yet is spelled out from itself", () => {
    expect(labelFor("title")).toBe("Título");
    expect(labelFor("someNewKey")).toBe("Some New Key");
  });
});
