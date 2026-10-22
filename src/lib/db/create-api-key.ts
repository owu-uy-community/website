/* eslint-disable no-console */
/**
 * Mints an API key for a service account (a machine: the Owy bot, a Stream Deck, a companion).
 * Keys never belong to people, always expire, and only carry the permissions of their preset.
 *
 *   pnpm owy:key                                   # the Owy bot's key (preset "owy")
 *   pnpm auth:key -- --owner stream-deck --name "Stream Deck escenario" --preset stream-deck
 *   pnpm auth:key -- --owner companion --name "Owy companion" --preset companion --days 90
 *
 * The key is printed ONCE (Better Auth stores its hash). Revoke it from /admin/acceso (Llaves API),
 * or by deleting its row in `apikey`; no redeploy needed.
 */
import "dotenv/config";

import { ensureServiceAccount, KEY_PRESETS, mintServiceKey, type KeyPreset } from "../authz/keys";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const owner = argValue("--owner") ?? "owy-bot";
  const preset = (argValue("--preset") ?? "owy") as KeyPreset;
  if (!(preset in KEY_PRESETS)) throw new Error(`Unknown preset "${preset}": ${Object.keys(KEY_PRESETS).join(", ")}`);
  const days = Number(argValue("--days") ?? 365);
  const name = argValue("--name") ?? preset;

  await ensureServiceAccount(owner, owner === "owy-bot" ? "Owy" : (argValue("--owner-name") ?? name));
  const minted = await mintServiceKey({
    ownerId: owner,
    name,
    permissions: KEY_PRESETS[preset],
    expiresInDays: days,
    createdById: null,
  });

  console.log("\n✅ API key created. Copy it now — it is not shown again:\n");
  console.log(`   ${minted.key}\n`);
  console.log(
    `   id: ${minted.id} · owner: ${owner} · preset: ${preset} · expires: ${minted.expiresAt?.toISOString() ?? "never"}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Could not create the API key:", error);
    process.exit(1);
  });
