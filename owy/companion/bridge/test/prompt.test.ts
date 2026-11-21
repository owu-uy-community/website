import { describe, expect, it } from "vitest";
import { assemble, loadPromptBundle } from "../src/realtime/prompt";

describe("prompt assembly", () => {
  it("layers persona, voice addendum and knowledge", () => {
    const system = assemble("# Identidad\nSos Owy.", "Hablá corto.", [{ file: "evento.md", content: "# Evento\nSábado." }]);
    expect(system.indexOf("# Instrucciones base de Owy")).toBeLessThan(system.indexOf("# Modo companion"));
    expect(system.indexOf("# Modo companion")).toBeLessThan(system.indexOf("# Conocimiento"));
    expect(system).toContain('<archivo nombre="evento.md">');
    expect(system).toContain("Hablá corto.");
  });

  it("reads the real agent files and interpolates the grid URL", async () => {
    const bundle = await loadPromptBundle({ gridUrl: "https://owu.uy/comunidad/owu/events/conf-2026/openspace" });
    expect(bundle.instructions).toContain("Owy");
    expect(bundle.knowledge.map((k) => k.file)).toContain("open-space.md");
    expect(bundle.companion).not.toContain("{{eventName}}");
    expect(bundle.system).toContain("propose_talk");
    expect(bundle.system).toContain("<archivo nombre=\"evento.md\">");
  });
});
