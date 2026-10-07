import { readFileSync } from "node:fs";
import { Pcm16Resampler, DEVICE_SAMPLE_RATE, fromWav, toWav } from "../audio/pcm";
import { loadConfig } from "../config";
import { announcementText, gatewayPitchExtractor } from "../pitch";

/**
 * Runs the pitch extractor on a WAV file and prints what the knob would do
 * with it — the runnable check for the prompt, without hardware:
 *
 *   pnpm companion:pitch recording.wav          # the card + the announcement
 *   pnpm companion:pitch answer.wav --name      # the name step
 */
async function main(): Promise<void> {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.error("uso: pnpm companion:pitch <archivo.wav> [--name]");
    process.exit(2);
  }
  const config = loadConfig();
  if (!config.AI_GATEWAY_API_KEY) throw new Error("Falta AI_GATEWAY_API_KEY");
  const extractor = gatewayPitchExtractor({
    apiKey: config.AI_GATEWAY_API_KEY,
    model: config.COMPANION_PITCH_MODEL,
    eventName: config.COMPANION_EVENT_NAME,
  });

  const { pcm, sampleRate, channels } = fromWav(readFileSync(file));
  if (channels !== 1) throw new Error("el WAV tiene que ser mono");
  const mono16k = sampleRate === DEVICE_SAMPLE_RATE ? pcm : new Pcm16Resampler(sampleRate, DEVICE_SAMPLE_RATE).process(pcm);
  const wav = toWav(mono16k, DEVICE_SAMPLE_RATE);
  console.log(`${file}: ${(mono16k.length / (DEVICE_SAMPLE_RATE * 2)).toFixed(1)} s @16k`);

  const started = Date.now();
  if (flag === "--name") {
    const result = await extractor.name(wav, new AbortController().signal);
    console.log(JSON.stringify(result), `(${Date.now() - started} ms)`);
    return;
  }
  const card = await extractor.card(wav, new AbortController().signal);
  console.log(JSON.stringify(card, null, 2), `(${Date.now() - started} ms)`);
  if (card.isPitch && card.title) {
    console.log(
      "\nOwy diría:",
      announcementText(
        { title: card.title, speaker: card.speaker, room: "Cueva", timeSlot: "15:00 - 15:45" },
        { askName: !card.speaker }
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
