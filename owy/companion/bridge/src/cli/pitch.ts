import { readFileSync } from "node:fs";
import { Pcm16Resampler, DEVICE_SAMPLE_RATE, fromWav, toWav } from "../audio/pcm";
import { loadConfig } from "../config";
import { createLogger } from "../log";
import { PITCH_LINES, QUESTION, announcementText, gatewayPitchExtractor, type PitchField } from "../pitch";
import { draftFromCard, mergeAnswer, nextStep } from "../pitch-flow";

/**
 * Runs the pitch extractor on WAV files and prints what the knob would do
 * with them — the runnable check for the prompts, without hardware:
 *
 *   pnpm companion:pitch pitch.wav                    # the card, and what Owy would ask next
 *   pnpm companion:pitch pitch.wav nombre.wav         # …plus the answer(s) to Owy's questions, in order
 */
async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("uso: pnpm companion:pitch <pitch.wav> [respuesta.wav …]");
    process.exit(2);
  }
  const config = loadConfig();
  if (!config.AI_GATEWAY_API_KEY) throw new Error("Falta AI_GATEWAY_API_KEY");
  const extractor = gatewayPitchExtractor({
    apiKey: config.AI_GATEWAY_API_KEY,
    model: config.COMPANION_PITCH_MODEL,
    eventName: config.COMPANION_EVENT_NAME,
    logger: createLogger("pitch", config.COMPANION_LOG_LEVEL),
  });
  const signal = new AbortController().signal;
  const read = (file: string) => {
    const { pcm, sampleRate, channels } = fromWav(readFileSync(file));
    if (channels !== 1) throw new Error(`${file}: el WAV tiene que ser mono`);
    const mono16k = sampleRate === DEVICE_SAMPLE_RATE ? pcm : new Pcm16Resampler(sampleRate, DEVICE_SAMPLE_RATE).process(pcm);
    console.log(`${file}: ${(mono16k.length / (DEVICE_SAMPLE_RATE * 2)).toFixed(1)} s @16k`);
    return toWav(mono16k, DEVICE_SAMPLE_RATE);
  };

  let started = Date.now();
  const card = await extractor.card(read(files[0]), signal);
  console.log(JSON.stringify(card, null, 2), `(${Date.now() - started} ms)`);
  let draft = draftFromCard(card);
  if (!draft) return console.log(`\nOwy diría: «${PITCH_LINES.empty}»`);

  for (const answerFile of files.slice(1)) {
    const step = nextStep(draft, true);
    if (!("ask" in step)) break;
    const field: PitchField = step.ask;
    console.log(`\nOwy pregunta: «${PITCH_LINES[QUESTION[field]]}»`);
    started = Date.now();
    const answer = await extractor.answer(
      read(answerFile),
      { field, question: PITCH_LINES[QUESTION[field]], transcript: draft.transcript },
      signal
    );
    console.log(JSON.stringify(answer), `(${Date.now() - started} ms)`);
    draft = mergeAnswer(draft, field, answer);
  }

  const step = nextStep(draft, true);
  if ("ask" in step) return console.log(`\nOwy preguntaría: «${PITCH_LINES[QUESTION[step.ask]]}» (pasá la respuesta como otro WAV)`);
  if ("reject" in step) return console.log(`\nOwy diría: «${PITCH_LINES.unclear}»`);
  console.log(
    "\nLa card:",
    JSON.stringify({ title: draft.title, speaker: draft.speaker, description: draft.description }),
    "\nOwy diría:",
    announcementText({ title: draft.title!, speaker: draft.speaker, room: "Cueva", timeSlot: "15:00 - 15:45" })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
