import { describe, expect, test } from "vitest";

import { TALK_SLIDES, cueText, inputKey, slideSteps, stepAfter, stepBefore, talkSlide, type TalkSlide } from "./deck";

describe("talk deck", () => {
  test("ids are unique, every vote has options, a vs round is two builds", () => {
    expect(new Set(TALK_SLIDES.map((slide) => slide.id)).size).toBe(TALK_SLIDES.length);
    const shortVotes = TALK_SLIDES.filter((slide) => slide.input?.kind === "vote" && slide.input.options.length < 2);
    expect(shortVotes).toStrictEqual([]);
    const badVs = TALK_SLIDES.filter((slide) => slide.layout === "vs" && slideSteps(slide) !== slide.rounds.length * 2);
    expect(badVs).toStrictEqual([]);
  });

  test("every click shows one more thing: a slide has exactly as many builds as it has pieces", () => {
    const expected = (slide: TalkSlide): number | null => {
      switch (slide.layout) {
        case "map":
          return slide.build ? slide.build.length + (slide.pulse ? 1 : 0) : 1;
        case "screen":
          return slide.callouts.length + 1;
        case "phones":
          return slide.phones.length;
        case "sequence":
          return slide.messages.length;
        case "tree":
          return slide.entries.length;
        case "lanes":
          return slide.branches.length + 1;
        case "points":
          return slide.points.length;
        case "tiles":
          return slide.tiles.length;
        case "flow":
          return slide.stations.length;
        case "orbit":
          return slide.bodies.length + 1;
        default:
          return null;
      }
    };
    const off = TALK_SLIDES.filter((slide) => expected(slide) !== null && expected(slide) !== slideSteps(slide)).map(
      (slide) => `${slide.id}: ${slideSteps(slide)} builds, ${expected(slide)} pieces`
    );
    expect(off).toStrictEqual([]);
    // A message goes between lanes that exist; a callout stays inside its screenshot.
    const strays = TALK_SLIDES.flatMap((slide) =>
      slide.layout === "sequence"
        ? slide.messages
            .filter((message) => [message.from, message.to].some((lane) => lane < 0 || lane >= slide.lanes.length))
            .map((message) => `${slide.id}: ${message.label}`)
        : slide.layout === "screen"
          ? slide.callouts
              .filter(({ box: [x, y, w, h] }) => !(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1))
              .map((callout) => `${slide.id}: ${callout.title}`)
          : []
    );
    expect(strays).toStrictEqual([]);
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
    // Out of the 25-minute cut, still in the deck's vocabulary.
    const base = { section: "final", title: "x", seconds: 0, owy: "x" } as const;
    const poll: TalkSlide = {
      ...base,
      id: "poll",
      layout: "poll",
      reveal: "x",
      input: { kind: "vote", prompt: "?", options: ["Sí", "No"] },
    };
    expect(inputKey(poll, 1)).toBe("vote:poll");
    const vs: TalkSlide = {
      ...base,
      id: "vs",
      layout: "vs",
      rounds: [],
      input: { kind: "vote", prompt: "?", options: ["Humano", "Owy"] },
    };
    expect(inputKey(vs, 0)).toBe("vote:vs:0");
    expect(inputKey(vs, 3)).toBe("vote:vs:1");
    expect(inputKey({ ...base, id: "rating", layout: "rating", input: { kind: "stars", prompt: "?" } }, 0)).toBe(
      "stars:rating"
    );
  });

  test("the talk fits its 25 minutes, five of them questions", () => {
    expect(TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0)).toBeLessThanOrEqual(25 * 60);
    expect(talkSlide("qa").seconds).toBe(300);
  });

  test("an unknown slide falls back to the lobby; {top} needs a question", () => {
    expect(talkSlide("gone").id).toBe("lobby");
    const cue = { label: "x", mode: "say" as const, text: "La más votada: «{top}»." };
    expect(cueText(cue, null)).toBeNull();
    expect(cueText(cue, "¿Qué modelo usás?")).toBe("La más votada: «¿Qué modelo usás?».");
  });
});
