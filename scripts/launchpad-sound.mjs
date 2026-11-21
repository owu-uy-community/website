// Prepares one launchpad sound: a single take, no dead air, the bank's loudness.
//
//   node scripts/launchpad-sound.mjs <source> public/sounds/<name>.mp3 [start] [end]
//
// Without start/end (seconds of the source) the cut is found in the audio: from 10 ms before the
// first sample above -45 dBFS (or 40 dB under the peak, whichever is louder) to 50 ms after the
// last one above -60 dBFS (or 55 dB under the peak). Pass them to keep one take of a longer
// recording, or to skip room noise before a voice.
// Loudness: -16 LUFS integrated with peaks at -1 dBFS. A sound that would need more than 3 dB of
// limiting to get there stays quieter instead, so a click keeps its snap.
// Prints the duration for `seconds` in src/lib/launchpad/sounds.ts. Needs ffmpeg on the PATH.
import { execFileSync, spawnSync } from "node:child_process";

const [source, out, startArg, endArg] = process.argv.slice(2);
if (!source || !out) {
  console.error("usage: node scripts/launchpad-sound.mjs <source> <out.mp3> [start] [end]");
  process.exit(1);
}

const TARGET_LUFS = -16;
const CEILING_DB = -1;
const MAX_LIMITING_DB = 3;
const RATE = 48_000;
const dbfs = (db) => 10 ** (db / 20);

const raw = execFileSync("ffmpeg", ["-v", "error", "-i", source, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], {
  maxBuffer: 1 << 30,
});
const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const length = samples.length / RATE;
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

const onset = Math.max(dbfs(-45), peak * dbfs(-40));
const tail = Math.max(dbfs(-60), peak * dbfs(-55));
let first = 0;
let last = samples.length - 1;
while (first < last && Math.abs(samples[first]) < onset) first++;
while (last > first && Math.abs(samples[last]) < tail) last--;

const start = startArg ? Number(startArg) : Math.max(0, first / RATE - 0.01);
const end = endArg ? Number(endArg) : Math.min(length, last / RATE + 0.05);
const cut = `atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`;

// Loudness of the cut. Under 0.4 s there is no gated loudness to measure: those are set by peak.
const scan = spawnSync(
  "ffmpeg",
  ["-hide_banner", "-nostats", "-i", source, "-af", `${cut},ebur128=peak=true`, "-f", "null", "-"],
  {
    encoding: "utf8",
  }
);
const summary = scan.stderr.slice(scan.stderr.lastIndexOf("Summary:"));
const integrated = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
const truePeak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
const byPeak = CEILING_DB - truePeak;
const gain = integrated > -70 ? Math.min(TARGET_LUFS - integrated, byPeak + MAX_LIMITING_DB) : byPeak;

const filters = [
  cut,
  start > 0 && "afade=t=in:d=0.005",
  end < length - 0.01 && `afade=t=out:st=${Math.max(0, end - start - 0.04)}:d=0.04`,
  `volume=${gain.toFixed(2)}dB`,
  gain > byPeak && `alimiter=limit=${dbfs(CEILING_DB).toFixed(3)}:attack=2:release=60:level=false:latency=1`,
  // Whole MP3 frames for the encoder: ffmpeg 8's LAME rejects the odd-sized one a short cut leaves
  "asetnsamples=n=1152:p=0",
].filter(Boolean);

// VBR ~190 kb/s, no tags or cover art (one source carried a PNG)
const encode = ["-c:a", "libmp3lame", "-q:a", "2", "-map_metadata", "-1", "-id3v2_version", "0"];
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", source, "-map", "0:a:0", "-af", filters.join(","), ...encode, out]);
const seconds = Number(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], {
    encoding: "utf8",
  })
);
console.log(
  `${out}: ${start.toFixed(3)}–${end.toFixed(2)} s of ${length.toFixed(2)} s, ` +
    `${Number.isFinite(integrated) ? integrated : "?"} LUFS ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB → seconds: ${seconds.toFixed(1)}`
);
