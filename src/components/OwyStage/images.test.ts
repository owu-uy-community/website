import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { STAGE_IMAGES } from "./images";

describe("wall picture preload", () => {
  test("every picture the wall preloads is a file under public/", () => {
    const missing = STAGE_IMAGES.filter((src) => !existsSync(resolve("public", `.${src}`)));

    expect(STAGE_IMAGES.length).toBeGreaterThan(50);
    expect(missing).toStrictEqual([]);
  });
});
