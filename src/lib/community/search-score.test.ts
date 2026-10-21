import { describe, expect, it } from "vitest";

import { scoreItem } from "./search-score";

describe("scoreItem", () => {
  it("needs every word, ignoring accents", () => {
    expect(scoreItem("Código de conducta · Páginas", "codigo")).toBeGreaterThan(0);
    expect(scoreItem("Eventos · Páginas", "segur", ["La agenda, con calendario para suscribirte"])).toBe(0);
    expect(scoreItem("OWASP Uruguay · Comunidades", "owasp segur", ["seguridad en aplicaciones"])).toBeGreaterThan(0);
  });

  it("ranks name hits above description hits", () => {
    const byName = scoreItem("Python Montevideo · Comunidades", "python");
    const byDescription = scoreItem("Data Science UY · Comunidades", "python", ["con Python y R"]);
    expect(byName).toBeGreaterThan(byDescription);
  });
});
