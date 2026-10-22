import { describe, expect, test } from "vitest";

import { safeNext } from "./safe-next";

describe(safeNext, () => {
  test("keeps paths on this site, with their query", () => {
    expect(safeNext("/organizar/panel/python?paso=fecha")).toBe("/organizar/panel/python?paso=fecha");
  });

  test("refuses other origins and falls back", () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com", "mailto:hola@owu.uy", "", null, undefined]) {
      expect(safeNext(next)).toBe("/");
    }
    expect(safeNext("//evil.com", "/organizar/panel")).toBe("/organizar/panel");
  });
});
