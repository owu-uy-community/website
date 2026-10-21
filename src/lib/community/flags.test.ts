import { afterEach, describe, expect, test, vi } from "vitest";

describe("resources launch flag", () => {
  // The flag is read when the module loads, so each state gets a fresh import
  const loadFlags = async (value: string) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_FLAG_RECURSOS", value);

    return import("./flags");
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    ["/semanario", true],
    ["/semanario/3", true],
    ["/semanario/feed.xml", true],
    ["/encuesta-sueldos/datos.csv", true],
    ["/semanarios", false],
    ["/blog", false],
    ["/", false],
  ])("while off, hides %s: %s", async (path, hidden) => {
    const { isHiddenPath } = await loadFlags("");

    expect(isHiddenPath(path)).toBe(hidden);
  });

  test("while off, hides the guides and nothing else from the blog", async () => {
    const { isHiddenPost } = await loadFlags("");

    expect(isHiddenPost(["guias", "carrera"])).toBe(true);
    expect(isHiddenPost(["recap"])).toBe(false);
    expect(isHiddenPost()).toBe(false);
  });

  test("once on, hides nothing", async () => {
    const { RESOURCES_ON, isHiddenPath, isHiddenPost } = await loadFlags("1");

    expect(RESOURCES_ON).toBe(true);
    expect(isHiddenPath("/semanario")).toBe(false);
    expect(isHiddenPath("/encuesta-sueldos")).toBe(false);
    expect(isHiddenPost(["guias"])).toBe(false);
  });
});
