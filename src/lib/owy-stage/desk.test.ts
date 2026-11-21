import { describe, expect, test } from "vitest";

import { afterTake, cue, cueQueued, findPreset, presetStep, readDesk, showsPreset } from "./desk";
import { EMPTY_DESK, parseSceneParams, type Desk, type DeskStep, type Preset } from "./scenes";

const step = (id: string, scene: DeskStep["scene"] = "message", from: DeskStep["from"] = "pick"): DeskStep => ({
  id,
  scene,
  params: {},
  from,
});
const preset = (id: string, scene: Preset["scene"] = "logo", params: Preset["params"] = {}): Preset => ({
  id,
  name: "",
  scene,
  params,
});

describe(cue, () => {
  test("a pick replaces a pick, and the old one is gone", () => {
    const desk: Desk = { ...EMPTY_DESK, preview: step("a"), queue: [step("q1")] };

    expect(cue(desk, step("b"))).toMatchObject({ preview: { id: "b" }, queue: [{ id: "q1" }] });
  });

  test("a preview that came from the queue goes back to its front", () => {
    const desk: Desk = { ...EMPTY_DESK, preview: step("q0", "logo", "queue"), queue: [step("q1")] };

    expect(cue(desk, step("b")).queue.map((item) => item.id)).toStrictEqual(["q0", "q1"]);
  });

  test("a swap (the scene that left the air) is dropped like a pick", () => {
    const desk: Desk = { ...EMPTY_DESK, preview: step("s", "logo", "swap") };

    expect(cue(desk, step("b")).queue).toStrictEqual([]);
  });
});

describe(cueQueued, () => {
  test("pulls the step out of the queue and marks it as queued", () => {
    const desk: Desk = { ...EMPTY_DESK, queue: [step("q1"), step("q2"), step("q3")] };
    const next = cueQueued(desk, "q2");

    expect(next.preview).toMatchObject({ id: "q2", from: "queue" });
    expect(next.queue.map((item) => item.id)).toStrictEqual(["q1", "q3"]);
  });

  test("swapping two queued steps keeps both", () => {
    const desk = cueQueued({ ...EMPTY_DESK, queue: [step("q1"), step("q2")] }, "q1");
    const next = cueQueued(desk, "q2");

    expect(next.preview?.id).toBe("q2");
    expect(next.queue.map((item) => item.id)).toStrictEqual(["q1"]);
  });

  test("an unknown id changes nothing", () => {
    const desk: Desk = { ...EMPTY_DESK, queue: [step("q1")] };

    expect(cueQueued(desk, "nope")).toBe(desk);
  });
});

describe(afterTake, () => {
  const left = { scene: "logo" as const, params: { a: 1 } };

  test("the head of the queue moves into preview", () => {
    const desk: Desk = { ...EMPTY_DESK, preview: step("p"), queue: [step("q1", "program"), step("q2")] };
    const next = afterTake(desk, left, "new");

    expect(next.preview).toMatchObject({ id: "q1", scene: "program", from: "queue" });
    expect(next.queue.map((item) => item.id)).toStrictEqual(["q2"]);
  });

  test("with nothing queued, the scene that left the air comes back", () => {
    const next = afterTake({ ...EMPTY_DESK, preview: step("p") }, left, "new");

    expect(next.preview).toStrictEqual({ id: "new", scene: "logo", params: { a: 1 }, from: "swap" });
  });

  test("presets ride along untouched", () => {
    expect(afterTake({ ...EMPTY_DESK, presets: [preset("a")] }, left, "new").presets).toStrictEqual([preset("a")]);
  });
});

describe(readDesk, () => {
  test("drops scenes that left the registry and anything malformed", () => {
    const desk = readDesk({
      preview: { id: "p", scene: "gone-scene", params: {} },
      queue: [{ id: "q1", scene: "logo" }, { id: "q2", scene: "nope" }, "junk"],
      presets: [{ id: "a", scene: "logo", name: "  Logo grande " }, { id: "b", scene: "nope" }, 3],
    });

    expect(desk).toStrictEqual({
      preview: null,
      queue: [{ id: "q1", scene: "logo", params: {}, from: "pick" }],
      presets: [{ id: "a", scene: "logo", name: "Logo grande", params: {} }],
    });
  });

  test("an empty or missing desk reads as empty", () => {
    expect(readDesk(null)).toStrictEqual(EMPTY_DESK);
    expect(readDesk(undefined)).toStrictEqual(EMPTY_DESK);
  });

  test("a desk from before presets turns its favorites into presets, in order, so keys 1–9 keep their scene", () => {
    const { presets } = readDesk({ preview: null, queue: [], favorites: ["logo", "nope", "message", "logo", 3] });

    expect(presets).toStrictEqual([
      { id: "fav-logo", name: "", scene: "logo", params: {} },
      { id: "fav-message", name: "", scene: "message", params: {} },
    ]);
  });

  test("once there are presets, leftover favorites are ignored", () => {
    expect(readDesk({ presets: [], favorites: ["logo"] }).presets).toStrictEqual([]);
  });
});

describe(findPreset, () => {
  const presets = [preset("a"), preset("b"), preset("c")];

  test("by its number on the desk, counting from one", () => {
    expect(findPreset(presets, "2")?.id).toBe("b");
    expect(findPreset(presets, "4")).toBeUndefined();
    expect(findPreset(presets, "0")).toBeUndefined();
  });

  test("by its id, which survives a reorder", () => {
    expect(findPreset(presets, "c")?.id).toBe("c");
    expect(findPreset(presets, "zz")).toBeUndefined();
  });
});

describe(showsPreset, () => {
  const back = preset("a", "message", { title: "Volvemos" });

  test("same scene and same params, however they're spelled", () => {
    expect(showsPreset(back, { scene: "message", params: { title: "Volvemos" } })).toBe(true);
    // A defaults preset matches the defaults written out, as the wall stores them after a take.
    expect(showsPreset(preset("d", "message"), { scene: "message", params: parseSceneParams("message", {}) })).toBe(
      true
    );
  });

  test("other params, another scene or nothing is not it", () => {
    expect(showsPreset(back, { scene: "message", params: { title: "Almuerzo" } })).toBe(false);
    expect(showsPreset(back, { scene: "logo", params: {} })).toBe(false);
    expect(showsPreset(back, null)).toBe(false);
  });
});

describe(presetStep, () => {
  test("a recalled preset remembers where it came from, through the queue and back", () => {
    const step = presetStep(preset("a", "message", { title: "Volvemos" }), "s1");
    const desk = cueQueued({ ...EMPTY_DESK, queue: [{ ...step, from: "queue" }] }, "s1");

    expect(step).toStrictEqual({
      id: "s1",
      scene: "message",
      params: { title: "Volvemos" },
      from: "pick",
      preset: "a",
    });
    expect(desk.preview).toMatchObject({ id: "s1", preset: "a" });
  });
});
