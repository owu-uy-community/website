import { describe, expect, test } from "vitest";

import { INTRO_SLIDES, clickerAction, introAt, introStep, type IntroPosition } from "./openspace-intro";

describe("open space intro", () => {
  test("next walks every build, then the next slide; back mirrors it", () => {
    const seen: string[] = [];
    let at: IntroPosition | null = { slide: INTRO_SLIDES[0].id, build: 0 };
    while (at) {
      seen.push(`${at.slide}:${at.build}`);
      at = introStep(at, "next");
    }
    expect(seen).toHaveLength(INTRO_SLIDES.reduce((sum, slide) => sum + slide.builds, 0));

    const back: string[] = [];
    let from: IntroPosition | null = introStep({ slide: "x", build: 0 }, "last");
    while (from) {
      back.push(`${from.slide}:${from.build}`);
      from = introStep(from, "prev");
    }
    expect(back.toReversed()).toStrictEqual(seen);
  });

  test("an unknown slide is the cover, a build past the end the last one", () => {
    expect(introAt({ slide: "gone", build: 9 }).slide.id).toBe("portada");
    expect(introAt({ slide: "dinamica", build: 99 }).build).toBe(4);
  });

  test("clicker keys: page keys move, b and . black out, F5 never reloads", () => {
    expect(["PageDown", "PageUp", ".", "F5", "Escape"].map(clickerAction)).toStrictEqual([
      "next",
      "prev",
      "blank",
      "play",
      null,
    ]);
    expect(introStep({ slide: "owy", build: 0 }, "blank")).toBeNull();
  });
});
