import { existsSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { SOUND_GROUPS, SOUNDS } from "./sounds";

describe("the launchpad bank", () => {
  test("ids are unique (OBS cues store them) and every pad has its file", () => {
    expect(new Set(SOUNDS.map((sound) => sound.id)).size).toBe(SOUNDS.length);
    const missing = SOUNDS.filter((sound) => !existsSync(`${import.meta.dirname}/../../../public${sound.audioFile}`));
    expect(missing).toStrictEqual([]);
  });

  test("the pads come grouped, in the order of the sections", () => {
    const order = Object.keys(SOUND_GROUPS);
    const groups = SOUNDS.map((sound) => order.indexOf(sound.group));
    expect(groups).toStrictEqual(groups.toSorted((a, b) => a - b));
  });
});
