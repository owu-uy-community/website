import { afterEach, describe, expect, test, vi } from "vitest";

import { soon } from "./soon";

describe(soon, () => {
  afterEach(() => vi.useRealTimers());

  test("a mark isn't taken by the first look: it stays up for its window, then drops", () => {
    vi.useFakeTimers();
    const work = soon(30_000);
    expect(work.pending()).toBe(false);

    work.mark();
    expect([work.pending(), work.pending()]).toStrictEqual([true, true]);

    vi.advanceTimersByTime(30_001);
    expect(work.pending()).toBe(false);
  });
});
