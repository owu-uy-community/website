import { describe, expect, test } from "vitest";

import { TALK_SLIDES, cueText, inputKey, slideSteps, stepAfter, stepBefore, talkSlide } from "./deck";

describe("talk deck", () => {
  test("ids are unique, every vote has options, a vs round is two builds", () => {
    expect(new Set(TALK_SLIDES.map((slide) => slide.id)).size).toBe(TALK_SLIDES.length);
    const shortVotes = TALK_SLIDES.filter((slide) => slide.input?.kind === "vote" && slide.input.options.length < 2);
    expect(shortVotes).toStrictEqual([]);
    const badVs = TALK_SLIDES.filter((slide) => slide.layout === "vs" && slideSteps(slide) !== slide.rounds.length * 2);
    expect(badVs).toStrictEqual([]);
  });

  test("next walks every build, then the next slide; back mirrors it", () => {
    const seen: string[] = [];
    let at: { slide: string; step: number } | null = { slide: TALK_SLIDES[0].id, step: 0 };
    while (at) {
      seen.push(`${at.slide}:${at.step}`);
      at = stepAfter(at);
    }
    const builds = TALK_SLIDES.reduce((sum, slide) => sum + slideSteps(slide), 0);
    expect(seen).toHaveLength(builds);

    const back: string[] = [];
    const [last, step] = seen.at(-1)!.split(":");
    let from: { slide: string; step: number } | null = { slide: last, step: Number(step) };
    while (from) {
      back.push(`${from.slide}:${from.step}`);
      from = stepBefore(from);
    }
    expect(back.toReversed()).toStrictEqual(seen);
  });

  test("questions share one key, votes are per slide and per vs round", () => {
    expect(inputKey(talkSlide("title"), 0)).toBe("question");
    expect(inputKey(talkSlide("poll-bathroom"), 1)).toBe("vote:poll-bathroom");
    expect(inputKey(talkSlide("vs"), 0)).toBe("vote:vs:0");
    expect(inputKey(talkSlide("vs"), 3)).toBe("vote:vs:1");
    expect(inputKey(talkSlide("rating"), 0)).toBe("stars:rating");
  });

  test("an unknown slide falls back to the lobby; {top} needs a question", () => {
    expect(talkSlide("gone").id).toBe("lobby");
    const cue = { label: "x", mode: "say" as const, text: "La más votada: «{top}»." };
    expect(cueText(cue, null)).toBeNull();
    expect(cueText(cue, "¿Qué modelo usás?")).toBe("La más votada: «¿Qué modelo usás?».");
  });
});
