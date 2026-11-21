import { describe, expect, test } from "vitest";

import { CONF_LOOPS, CONF_SECTIONS, OTHER_SCENE_COUNT } from "./conf";
import { INTERACTIVE_SCENES, SCENE_IDS, SCENES, parseSceneParams, type SceneId } from "./scenes";

describe("OWU CONF shortlist and loops", () => {
  test("every shortlisted scene is listed once and the rest are counted", () => {
    const listed = CONF_SECTIONS.flatMap((section) => section.scenes);

    expect(new Set(listed).size).toBe(listed.length);
    expect(OTHER_SCENE_COUNT).toBe(SCENE_IDS.length - listed.length);
  });

  test("every loop step is a timed take whose params the wall accepts", () => {
    for (const loop of CONF_LOOPS)
      for (const [scene, sec, params] of loop.steps) {
        expect(sec, `${loop.id}/${scene}`).toBeGreaterThan(0);
        expect(() => parseSceneParams(scene, params)).not.toThrow();
        // An override must name a real param, or it is silently dropped.
        for (const key of Object.keys(params ?? {})) expect(SCENES[scene].params.shape).toHaveProperty(key);
      }
  });

  test("no loop carries a phone scene: each take would start a new round and wipe its votes", () => {
    const phone = new Set<SceneId>(INTERACTIVE_SCENES);

    expect(
      CONF_LOOPS.flatMap((loop) => loop.steps.map(([scene]) => scene)).filter((id) => phone.has(id))
    ).toStrictEqual([]);
  });
});
