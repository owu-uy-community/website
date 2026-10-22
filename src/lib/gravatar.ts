/**
 * Gravatar avatar URL for an email (https://docs.gravatar.com/sdk/images/). Gravatar takes a
 * SHA-256 of the trimmed, lowercased address; Web Crypto computes it in every browser, so the
 * client doesn't ship Node's crypto polyfill (~130 KB gzipped) just to draw an avatar.
 */
export async function gravatarUrl(email: string, size = 200): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}
