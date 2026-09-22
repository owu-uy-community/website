/**
 * Model bake-off for the open-space card OCR.
 *
 *   AI_GATEWAY_API_KEY=… pnpm tsx scripts/ocr-bench.ts [model…]
 *
 * Public benchmarks rank these models on other people's documents; this ranks them on our cards,
 * with our prompt, which is the only ranking that decides what ships. Run it again whenever the
 * prompt or the shortlist changes, and once more the week before an event.
 *
 * Fixtures live in `scripts/ocr-fixtures/data/` — photos plus an `expected.json`. That folder is
 * gitignored (the repo-wide `data/` rule), which is where we want photos of other people's
 * handwriting to stay.
 *
 *   data/expected.json:
 *   [{ "file": "01.jpg", "title": "…", "speaker": "…", "requisito": "tv" }]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { processImage } from "../src/lib/orpc/ocr/services/process-image";

const FIXTURES = path.join(process.cwd(), "scripts/ocr-fixtures/data");

const DEFAULT_MODELS = ["google/gemini-3.8-flash", "google/gemini-3.5-flash-lite", "openai/gpt-5.6-terra"];

interface Fixture {
  file: string;
  title: string;
  speaker: string;
  requisito: string;
}

/** Normalised edit distance, 1 = identical. Accent- and case-insensitive: a staffer fixing a
 *  capital letter is not the failure we are hunting. */
function similarity(a: string, b: string): number {
  const norm = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const left = norm(a);
  const right = norm(b);

  if (left === right) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);

  for (let i = 1; i <= left.length; i++) {
    const current = [i];

    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const percentile = (values: number[], p: number) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : 0;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY is not set (locally the gateway needs a key; on Vercel it uses OIDC).");
  }

  const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS;
  const labels = await readFile(path.join(FIXTURES, "expected.json"), "utf8").catch(() => {
    throw new Error(
      `No fixtures yet. Drop photos of filled-in cards in ${FIXTURES}/ and label them in ` +
        `${FIXTURES}/expected.json:\n` +
        `  [{ "file": "01.jpg", "title": "…", "speaker": "…", "requisito": "tv|pizarra|ambos|ninguno" }]`
    );
  });
  const fixtures: Fixture[] = JSON.parse(labels);

  if (fixtures.length === 0) throw new Error(`No fixtures in ${FIXTURES}/expected.json`);

  console.log(`${fixtures.length} cards × ${models.length} models\n`);

  const images = new Map<string, string>();

  for (const fixture of fixtures) {
    const bytes = await readFile(path.join(FIXTURES, fixture.file));
    const mediaType = fixture.file.endsWith(".png") ? "image/png" : "image/jpeg";

    images.set(fixture.file, `data:${mediaType};base64,${bytes.toString("base64")}`);
  }

  for (const primary of models) {
    // No fallbacks: a bake-off has to measure the model named on the tin.
    const model = { primary, fallbacks: [] as const };
    const titles: number[] = [];
    const speakers: number[] = [];
    const requisitos: number[] = [];
    const latencies: number[] = [];
    let failures = 0;

    for (const fixture of fixtures) {
      const startedAt = Date.now();

      try {
        const result = await processImage({ imageData: images.get(fixture.file)! }, model);

        latencies.push(Date.now() - startedAt);
        titles.push(similarity(result.title, fixture.title));
        speakers.push(similarity(result.speaker, fixture.speaker));
        requisitos.push(result.requisito === fixture.requisito ? 1 : 0);

        const wrong = [
          similarity(result.title, fixture.title) < 1 && `title="${result.title}" (esperado "${fixture.title}")`,
          similarity(result.speaker, fixture.speaker) < 1 &&
            `speaker="${result.speaker}" (esperado "${fixture.speaker}")`,
          result.requisito !== fixture.requisito && `requisito=${result.requisito} (esperado ${fixture.requisito})`,
        ].filter(Boolean);

        if (wrong.length > 0) console.log(`  ${primary} · ${fixture.file}: ${wrong.join(" · ")}`);
      } catch (error) {
        failures++;
        console.log(`  ${primary} · ${fixture.file}: FALLÓ — ${(error as Error).message}`);
      }
    }

    console.log(
      [
        `\n${primary}`,
        `  título     exacto ${pct(mean(titles.map((s) => (s === 1 ? 1 : 0))))}  similitud ${pct(mean(titles))}`,
        `  speaker    exacto ${pct(mean(speakers.map((s) => (s === 1 ? 1 : 0))))}  similitud ${pct(mean(speakers))}`,
        `  requisito  ${pct(mean(requisitos))}`,
        `  latencia   p50 ${percentile(latencies, 0.5)}ms  p95 ${percentile(latencies, 0.95)}ms`,
        failures > 0 ? `  errores    ${failures}/${fixtures.length}` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
