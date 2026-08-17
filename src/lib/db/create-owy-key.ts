/* eslint-disable no-console */
/**
 * Provisions the Owy bot account (see /owy) and mints an API key for it.
 *
 *   pnpm owy:key                 # create the bot user if needed + a new key
 *   pnpm owy:key -- --name "owy prod"
 *
 * The key is printed ONCE — Better Auth stores it hashed. Put it in the Owy
 * project's OWY_API_KEY; Owy sends it as the `x-api-key` header and the API
 * authorizes it as the bot user (role `admin`).
 *
 * Revoking: disable or delete the row in `apikey` (no redeploy needed).
 * Re-running mints an additional key; old ones keep working until removed.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";

import { auth } from "../../app/lib/auth";
import { db } from ".";
import { user } from "./schema";

const BOT = {
  id: "owy-bot",
  name: "Owy",
  email: "owy@owu.uy",
} as const;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const [existing] = await db.select().from(user).where(eq(user.id, BOT.id)).limit(1);

  if (!existing) {
    const now = new Date();
    await db.insert(user).values({
      ...BOT,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role: "admin",
      status: "active",
    });
    console.log(`✅ Created the bot user ${BOT.id} (${BOT.email}) with role admin`);
  } else {
    console.log(`ℹ️  Bot user ${BOT.id} already exists`);
  }

  // `auth.api` loses the apiKey plugin's endpoint types (the config object
  // carries a runtime-only option behind @ts-expect-error, which widens the
  // plugin generics). The endpoint exists — name it explicitly.
  type CreateApiKey = (opts: {
    body: { userId: string; name?: string; prefix?: string };
  }) => Promise<{ id: string; key: string }>;

  const createApiKey = (auth.api as unknown as { createApiKey: CreateApiKey }).createApiKey;

  const result = await createApiKey({
    body: {
      userId: BOT.id,
      name: argValue("--name") ?? "owy",
      prefix: "owy",
    },
  });

  console.log("\n✅ API key created. Copy it now — it is not shown again:\n");
  console.log(`   OWY_API_KEY=${result.key}\n`);
  console.log(`   id: ${result.id}  ·  revoke by disabling/deleting that row in "apikey"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Could not create the Owy API key:", error);
    process.exit(1);
  });
