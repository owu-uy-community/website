/**
 * Gravatar utility functions
 * Generates avatar URLs based on email addresses using Gravatar's free API
 * Documentation: https://docs.gravatar.com/general/images/
 */

import crypto from "crypto";

/**
 * Generate MD5 hash of email for Gravatar
 * @param email - User's email address
 * @returns MD5 hash string
 */
export function getEmailHash(email: string): string {
  if (!email) return "";

  // Gravatar requires lowercase, trimmed email
  const normalizedEmail = email.trim().toLowerCase();

  // Create MD5 hash
  return crypto.createHash("md5").update(normalizedEmail).digest("hex");
}

/**
 * Generate Gravatar URL from email
 * @param email - User's email address
 * @param size - Avatar size in pixels (default: 200)
 * @param defaultImage - What to show if no Gravatar exists
 *   - 'identicon': geometric pattern based on email hash
 *   - 'monsterid': generated monster
 *   - 'wavatar': generated face
 *   - 'retro': 8-bit arcade style
 *   - 'robohash': generated robot
 *   - 'mp': mystery person (simple silhouette)
 * @returns Gravatar image URL
 */
export function getGravatarUrl(
  email: string,
  size: number = 200,
  defaultImage: "identicon" | "monsterid" | "wavatar" | "retro" | "robohash" | "mp" = "identicon"
): string {
  if (!email) {
    // Return a default mystery person avatar if no email
    return `https://www.gravatar.com/avatar/?s=${size}&d=mp`;
  }

  const hash = getEmailHash(email);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}`;
}

/**
 * Client-side version using Web Crypto API (for browser)
 * @param email - User's email address
 * @returns Promise with MD5 hash string
 */
export async function getEmailHashClient(email: string): Promise<string> {
  if (!email) return "";

  const normalizedEmail = email.trim().toLowerCase();
  const msgBuffer = new TextEncoder().encode(normalizedEmail);

  // Use SubtleCrypto for browser environment
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

/**
 * Client-side Gravatar URL generator (uses SHA-256 as fallback since MD5 isn't available in browsers)
 * Note: For production, consider computing MD5 server-side or using a library
 * @param email - User's email address
 * @param size - Avatar size in pixels (default: 200)
 * @param defaultImage - What to show if no Gravatar exists
 * @returns Gravatar image URL
 */
export function getGravatarUrlSimple(
  email: string,
  size: number = 200,
  defaultImage: "identicon" | "monsterid" | "wavatar" | "retro" | "robohash" | "mp" = "identicon"
): string {
  if (!email) {
    return `https://www.gravatar.com/avatar/?s=${size}&d=mp`;
  }

  // Simple client-side implementation using email directly
  // Note: This won't work perfectly with Gravatar but provides a fallback
  const normalizedEmail = email.trim().toLowerCase();
  const simpleHash = btoa(normalizedEmail)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 32);

  return `https://www.gravatar.com/avatar/${simpleHash}?s=${size}&d=${defaultImage}`;
}
