import { describe, expect, test } from "vitest";

import { formatCountdown } from "./time";

describe(formatCountdown, () => {
  test("under an hour it reads minutes and seconds", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(299)).toBe("04:59");
    expect(formatCountdown(3599)).toBe("59:59");
  });

  test("past an hour it reads hours too, instead of 290 minutes", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(17_420)).toBe("4:50:20");
  });
});
