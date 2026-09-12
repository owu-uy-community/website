import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { buildInputHashes, protocolFiles } from "./provenance.mjs";
const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../..");
const sdk = resolve(here, "../.eve/emsdk");
const emcc = process.env.EMCC || join(sdk, "upstream/emscripten/emcc");
const emxx = process.env.EMXX || join(sdk, "upstream/emscripten/em++");
const lvgl = process.env.LVGL_DIR || resolve(here, "../.eve/esphome-build/owy-companion/managed_components/lvgl__lvgl");
if (!existsSync(emcc) || !existsSync(lvgl)) throw Error("See emulator/README.md for pinned SDK/LVGL setup.");
const out = resolve(root, "public/companion-runtime");
const cache = resolve(here, "../.eve/emulator-build");
const inputManifest = JSON.parse(readFileSync(join(here, "generated/manifest.json"), "utf8"));
for (const [name, expected] of Object.entries(inputManifest.sourceHashes)) {
  const actual = createHash("sha256")
    .update(readFileSync(resolve(here, "../firmware", name)))
    .digest("hex");
  if (actual !== expected)
    throw Error(`Stale scene manifest: ${name}. Regenerate ESPHome source, then run companion:emulator:generate.`);
}
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });
const env = { ...process.env, EM_CONFIG: process.env.EM_CONFIG || join(sdk, ".emscripten") };
const compilerVersion = spawnSync(emcc, ["--version"], { env, encoding: "utf8" });
if (compilerVersion.status !== 0 || !/\b6\.0\.9\b/.test(compilerVersion.stdout))
  throw Error("Emscripten 6.0.9 is required; revalidate before upgrading.");
const lvVersion = readFileSync(join(lvgl, "lv_version.h"), "utf8");
for (const [part, value] of [
  ["MAJOR", 9],
  ["MINOR", 5],
  ["PATCH", 0],
])
  if (!new RegExp(`#define LVGL_VERSION_${part} ${value}\\b`).test(lvVersion)) throw Error("LVGL 9.5.0 is required.");
const flags = ["-O2", "-DLV_CONF_INCLUDE_SIMPLE", `-I${here}/generated`, `-I${lvgl}`];
const walk = (p) =>
  readdirSync(p, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(p, f.name)) : [join(p, f.name)]));
const sources = walk(join(lvgl, "src"))
  .filter((p) => p.endsWith(".c"))
  .sort();
const headers = createHash("sha256");
for (const header of walk(lvgl)
  .filter((p) => p.endsWith(".h"))
  .sort())
  headers.update(readFileSync(header));
const headerHash = headers.digest("hex");
const objects = new Array(sources.length);
let cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < sources.length) {
      const index = cursor++,
        source = sources[index];
      const key = createHash("sha256")
        .update(readFileSync(source))
        .update(readFileSync(join(here, "generated/lv_conf.h")))
        .update(headerHash)
        .update("emscripten6.0.9-O2")
        .digest("hex");
      const obj = join(cache, key + ".o");
      objects[index] = obj;
      if (existsSync(obj)) continue;
      await new Promise((ok, fail) => {
        const child = spawn(emcc, [...flags, "-c", source, "-o", obj], { env, stdio: ["ignore", "ignore", "pipe"] });
        let error = "";
        child.stderr.on("data", (d) => (error += d));
        child.on("error", fail);
        child.on("exit", (code) => (code === 0 ? ok() : fail(Error(error))));
      });
    }
  })
);
console.log(`LVGL: ${sources.length} translation units (incremental cache).`);
const link = spawnSync(
  emxx,
  [
    ...flags,
    "-std=c++17",
    "-I" + resolve(here, "../firmware"),
    join(here, "runtime.cpp"),
    ...objects,
    "--no-entry",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sENVIRONMENT=web,worker,node",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sINITIAL_MEMORY=16777216",
    "-sMAXIMUM_MEMORY=67108864",
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU16","HEAPF32","UTF8ToString","stringToUTF8"]',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_owy_init","_owy_advance","_owy_input","_owy_snapshot","_owy_pixels","_owy_cue","_owy_cue_size","_owy_trace","_owy_phase","_owy_audio_received","_owy_audio_buffered"]',
    "-o",
    join(out, "owy-runtime.mjs"),
  ],
  { env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
);
if (link.status !== 0) throw Error(link.stderr);
const manifest = JSON.parse(readFileSync(join(here, "generated/manifest.json"), "utf8"));
const require = createRequire(join(root, "package.json"));
const { build: bundle } = require("esbuild");
await bundle({
  entryPoints: [join(here, "bridge-adapter.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: join(here, "bridge.mjs"),
  alias: { "esphome-client": join(root, "owy/node_modules/esphome-client/dist/api-constants.js") },
  banner: {
    js: "// Generated from the real bridge VoiceTurn/PacedSpeaker + fixture transport adapter. Do not hand-edit.",
  },
});
manifest.wasmHash = createHash("sha256")
  .update(readFileSync(join(out, "owy-runtime.wasm")))
  .digest("hex");
manifest.glueHash = createHash("sha256").update(readFileSync(join(out, "owy-runtime.mjs"))).digest("hex");
const protocolHash = createHash("sha256");
copyFileSync(join(here, "THIRD-PARTY-NOTICES.txt"), join(out, "THIRD-PARTY-NOTICES.txt"));
for (const name of protocolFiles) {
  copyFileSync(join(here, name), join(out, name));
  protocolHash.update(readFileSync(join(here, name)));
}
manifest.protocolHash = protocolHash.digest("hex");
manifest.buildInputHashes = buildInputHashes();
manifest.version = createHash("sha256")
  .update(manifest.version + manifest.wasmHash + manifest.glueHash + manifest.protocolHash)
  .digest("hex")
  .slice(0, 16);
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${out}; WASM ${Math.round(readFileSync(join(out, "owy-runtime.wasm")).length / 1024)} KiB.`);
