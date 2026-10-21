import { describe, expect, test } from "vitest";

import { afterTake, cue, cueQueued, readDesk } from "./desk";
import { EMPTY_DESK, type Desk, type DeskStep } from "./scenes";

const step = (id: string, scene: DeskStep["scene"] = "message", from: DeskStep["from"] = "pick"): DeskStep => ({
  id,
  scene,
  params: {},
  from,
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

  test("favorites ride along untouched", () => {
    expect(afterTake({ ...EMPTY_DESK, favorites: ["logo"] }, left, "new").favorites).toStrictEqual(["logo"]);
  });
});

describe(readDesk, () => {
  test("drops scenes that left the registry and anything malformed", () => {
    const desk = readDesk({
      preview: { id: "p", scene: "gone-scene", params: {} },
      queue: [{ id: "q1", scene: "logo" }, { id: "q2", scene: "nope" }, "junk"],
      favorites: ["logo", "nope", 3],
    });

    expect(desk).toStrictEqual({
      preview: null,
      queue: [{ id: "q1", scene: "logo", params: {}, from: "pick" }],
      favorites: ["logo"],
    });
  });

  test("an empty or missing desk reads as empty", () => {
    expect(readDesk(null)).toStrictEqual(EMPTY_DESK);
    expect(readDesk(undefined)).toStrictEqual(EMPTY_DESK);
  });
});
