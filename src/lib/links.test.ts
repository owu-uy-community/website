import { describe, expect, test, vi } from "vitest";

import { readLink, signLink } from "./links";

describe("signed links", () => {
  vi.stubEnv("ORGANIZAR_SECRET", "test-secret");

  test("open what they were made for, until they expire", async () => {
    const token = await signLink("venue-request", "abc123", new Date(Date.now() + 60_000));

    await expect(readLink("venue-request", token)).resolves.toBe("abc123");
    await expect(readLink("venue-request", token, Date.now() + 120_000)).resolves.toBeNull();
    await expect(readLink("venue-request", await signLink("venue-request", "forever"))).resolves.toBe("forever");
  });

  test("refuse another purpose, a tampered id or another secret", async () => {
    const token = await signLink("venue-request", "abc123");

    await expect(readLink("ticket", token)).resolves.toBeNull();
    await expect(readLink("venue-request", token.replace("abc123", "abc124"))).resolves.toBeNull();
    vi.stubEnv("ORGANIZAR_SECRET", "another-secret");
    await expect(readLink("venue-request", token)).resolves.toBeNull();
  });
});
