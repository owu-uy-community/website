import { describe, expect, it } from "vitest";

import {
  ExpressionDirector,
  guessExpression,
  splitLines,
  type Classifier,
  type Expression,
  type Verdict,
} from "../src/expression";

/** A classifier whose answers the test releases by hand. */
function controlled() {
  const pending = new Map<string, (verdict: Verdict) => void>();
  const asked: string[] = [];
  const classify: Classifier = (text, kind) =>
    new Promise((resolve) => {
      asked.push(`${kind}:${text}`);
      pending.set(text, resolve);
    });
  const answer = async (text: string, expression: Expression, confidence = 0.9) => {
    pending.get(text)!({ expression, confidence });
    await Promise.resolve();
    await Promise.resolve();
  };
  return { classify, asked, answer };
}

function director(classify?: Classifier) {
  const sent: [Expression, number, number][] = [];
  const d = new ExpressionDirector({ classify, send: (e, lead, s) => sent.push([e, lead, s]), leadMs: () => 200 });
  return { d, sent };
}

describe("splitLines", () => {
  it("splits sentences, keeps times and decimals, and leaves the tail open while streaming", () => {
    const text = "¡Hola! La charla es a las 15:30 en la sala 3.5. ¿Querés que te la anote";
    const open = splitLines(text);
    expect(open.map((l) => [l.text, l.complete])).toEqual([
      ["¡Hola!", true],
      ["La charla es a las 15:30 en la sala 3.5.", true],
      ["¿Querés que te la anote", false],
    ]);
    expect(text.slice(open[1]!.start, open[1]!.end)).toBe("La charla es a las 15:30 en la sala 3.5.");
    expect(splitLines(text + "?", true).at(-1)).toMatchObject({ text: "¿Querés que te la anote?", complete: true });
    expect(splitLines("Uno.\nDos", true).map((l) => l.text)).toEqual(["Uno.", "Dos"]);
  });
});

describe("guessExpression", () => {
  it("covers the obvious cases instantly", () => {
    expect(guessExpression("Uh, perdón, esa charla ya se llenó.")).toBe("empathetic");
    expect(guessExpression("¿Querés que te la anote?")).toBe("curious");
    expect(guessExpression("¡Dale, anotate!")).toBe("excited");
    expect(guessExpression("¡Hola, qué bueno verte!")).toBe("happy");
    expect(guessExpression("Creo que es en la sala roja.")).toBe("thinking");
    expect(guessExpression("El almuerzo es a las 13.")).toBe("neutral");
  });
});

describe("ExpressionDirector", () => {
  const reply = "¡Hola! La charla es en la sala azul. ¿Querés que te la anote?";
  // 3 s of audio whose transcript grows evenly with it (what Gemini's deltas look like).
  const queueAll = (d: ExpressionDirector) => {
    for (let ms = 100; ms <= 3000; ms += 100) d.queued(ms * 32, Math.round((reply.length * ms) / 3000));
  };

  it("cues each sentence as it becomes audible, with jev's verdict when it is back in time", async () => {
    const jev = controlled();
    const { d, sent } = director(jev.classify);
    d.write(reply, true); // eve's answer arrives before Owy speaks
    expect(jev.asked).toEqual(["line:¡Hola!", "line:La charla es en la sala azul.", "line:¿Querés que te la anote?"]);
    await jev.answer("¡Hola!", "happy");
    await jev.answer("La charla es en la sala azul.", "neutral");
    queueAll(d);
    d.played(1024);
    expect(sent).toEqual([["happy", 200, 94]]);
    d.played(0.4 * 96_000); // into the second sentence
    expect(sent.at(-1)).toEqual(["neutral", 200, 94]);
    d.played(0.9 * 96_000); // third: jev not back yet → the local guess
    expect(sent.at(-1)).toEqual(["curious", 200, 60]);
    await jev.answer("¿Querés que te la anote?", "curious", 0.95);
    expect(sent.at(-1)).toEqual(["curious", 0, 97]); // the late verdict firms it up right away
    expect(sent).toHaveLength(4);
  });

  it("corrects a late verdict that disagrees with the guess", async () => {
    const jev = controlled();
    const { d, sent } = director(jev.classify);
    d.write("Ok, te espero acá.", true);
    queueAll(d);
    d.played(1024);
    expect(sent).toEqual([["neutral", 200, 60]]);
    await jev.answer("Ok, te espero acá.", "happy", 0.5);
    expect(sent.at(-1)).toEqual(["happy", 0, 68]); // unsure verdicts show softly
  });

  it("reacts to the visitor while thinking, but never once Owy is talking", async () => {
    const jev = controlled();
    const { d, sent } = director(jev.classify);
    d.react("Me perdí la charla de la mañana, qué bajón.");
    d.react("…y además llueve"); // once per turn
    await jev.answer("Me perdí la charla de la mañana, qué bajón.", "empathetic", 0.8);
    expect(sent).toEqual([["empathetic", 0, 87]]);
    expect(jev.asked).toHaveLength(1);
    const late = director(jev.classify);
    late.d.write("Hola.", true);
    late.d.queued(32_000, 5);
    late.d.played(1024);
    late.d.react("Che, ¿sos un búho?");
    expect(jev.asked).not.toContain("reaction:Che, ¿sos un búho?");
    expect(late.sent.map(([e]) => e)).toEqual(["happy"]);
  });

  it("follows the live transcript (local brain) and falls back to speaking rate without one", () => {
    const { d, sent } = director(); // no classifier: guesses only
    d.write("¡Dale, anotate");
    d.queued(16_000, 0);
    d.played(1024);
    expect(sent).toEqual([["excited", 200, 60]]);
    d.write("¡Dale, anotate! Perdón, se llenó.", true);
    d.queued(96_000, 0); // transcript never arrived: ~14 chars per second of audio
    d.played(1.5 * 32_000);
    expect(sent.at(-1)).toEqual(["empathetic", 200, 60]);
  });

  it("stops after the turn closes", async () => {
    const jev = controlled();
    const { d, sent } = director(jev.classify);
    d.write("Hola.", true);
    d.close();
    d.queued(32_000, 5);
    d.played(1024);
    await jev.answer("Hola.", "happy");
    expect(sent).toEqual([]);
  });
});
