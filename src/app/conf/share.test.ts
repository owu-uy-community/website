import { describe, expect, test } from "vitest";

import { cleanName, pick, SHARE_DESIGNS } from "./share";

describe(cleanName, () => {
  test("trims and collapses whitespace", () => {
    expect(cleanName("  Ada \n  Lovelace ")).toBe("Ada Lovelace");
  });

  test("caps long names at a word break", () => {
    expect(cleanName("Maximiliano Fernández Etcheverry González")).toBe("Maximiliano Fernández");
  });

  test("cuts a single long word at the cap", () => {
    expect(cleanName("x".repeat(40))).toHaveLength(24);
  });
});

describe(pick, () => {
  test("falls back for unknown and inherited keys", () => {
    expect(pick("venis", SHARE_DESIGNS, "voy")).toBe("venis");
    expect(pick("nope", SHARE_DESIGNS, "voy")).toBe("voy");
    expect(pick("toString", SHARE_DESIGNS, "voy")).toBe("voy");
  });
});
