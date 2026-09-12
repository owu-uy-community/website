import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const protocolFiles = ["worker.mjs", "session.mjs", "pose.mjs", "fixtures.mjs", "bridge.mjs"];
const inputs = [
  ...[
    "runtime.cpp",
    "font_adapter.h",
    "build.mjs",
    "generate-scene.mjs",
    "provenance.mjs",
    "bridge-adapter.ts",
    "THIRD-PARTY-NOTICES.txt",
    "generated/scene.generated.h",
    "generated/fonts.generated.h",
    "generated/lv_conf.h",
    "generated/manifest.json",
  ].map((p) => "owy/companion/emulator/" + p),
  ...["clock.ts", "device/pipeline.ts", "audio/pcm.ts"].map((p) => "owy/companion/bridge/src/" + p),
];
export function buildInputHashes() {
  return Object.fromEntries(inputs.map((p) => [p, sha256(readFileSync(resolve(root, p)))]));
}
export function verifyArtifacts() {
  const out = resolve(root, "public/companion-runtime");
  const manifest = JSON.parse(readFileSync(resolve(out, "manifest.json"), "utf8"));
  const check = (path, hash) => {
    if (sha256(readFileSync(path)) !== hash)
      throw Error(`Stale companion artifact: ${path}. Run generate, build, then test.`);
  };
  for (const [p, hash] of Object.entries(manifest.sourceHashes))
    check(resolve(root, "owy/companion/firmware", p), hash);
  if (!manifest.buildInputHashes) throw Error("Missing build provenance");
  for (const [p, hash] of Object.entries(buildInputHashes())) {
    if (manifest.buildInputHashes[p] !== hash) throw Error(`Stale build input: ${p}. Rebuild the emulator.`);
  }
  check(resolve(out, "owy-runtime.wasm"), manifest.wasmHash);
  check(resolve(out, "owy-runtime.mjs"), manifest.glueHash);
  check(resolve(out, "THIRD-PARTY-NOTICES.txt"), sha256(readFileSync(resolve(root, "owy/companion/emulator/THIRD-PARTY-NOTICES.txt"))));
  const protocol = createHash("sha256");
  for (const name of protocolFiles) {
    const bytes = readFileSync(resolve(root, "owy/companion/emulator", name));
    check(resolve(out, name), sha256(bytes));
    protocol.update(bytes);
  }
  if (protocol.digest("hex") !== manifest.protocolHash) throw Error("Stale worker protocol");
  return manifest;
}
