import { createHmac } from "node:crypto";

import { createId } from "@paralleldrive/cuid2";

import { db } from "lib/db";
import { session } from "lib/db/schema";

/**
 * Mint a Better Auth session the way Better Auth would after a Slack sign-in:
 * a `session` row plus the signed cookie value
 * (`<token>.<base64 HMAC-SHA256(secret, token)>`, URL-encoded).
 */
export async function mintSession(userId: string, secret = process.env.BETTER_AUTH_SECRET ?? "") {
  const token = createId();
  const now = new Date();
  await db.insert(session).values({
    id: createId(),
    token,
    userId,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
  const signature = createHmac("sha256", secret).update(token).digest("base64");

  return { name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`) };
}
