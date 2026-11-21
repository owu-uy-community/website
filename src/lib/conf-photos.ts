// conf.owu.uy/fotos: attendees upload the day's photos from their phones. Shared by the page
// (which resizes and re-encodes before sending) and the route (which checks what arrives).

/** Photos one phone may upload. */
export const PHOTOS_PER_PHONE = 80;

/**
 * Photos for the whole event. Vercel Blob on Hobby allows 1 GB stored and 2,000 uploads a
 * month, and going over locks Blob for 30 days: ~1,500 photos at ~0.5 MB stay under both.
 * ponytail: raise CONF_PHOTOS_MAX_TOTAL once the team is on Pro.
 */
export const photosMaxTotal = () => Number(process.env.CONF_PHOTOS_MAX_TOTAL) || 1500;

/** Longest side the phone resizes to, and the JPEG quality it encodes with: ~0.3–0.8 MB a photo. */
export const MAX_SIDE = 2048;
export const JPEG_QUALITY = 0.82;

/** What the route accepts: a resized JPEG is far below this; Vercel refuses bodies over 4.5 MB anyway. */
export const MAX_BYTES = 4 * 1024 * 1024;

/** The phone's file before resizing: past this it is no photo (or one the phone can't decode). */
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export const PHONE_COOKIE = "owu_fotos";

/** 16 random bytes as base64url: what the route mints, and the only shape it reads back. */
export const isPhoneId = (value: string | undefined): value is string => !!value && /^[A-Za-z0-9_-]{22}$/.test(value);

/**
 * A whole JPEG: starts with SOI (FF D8 FF) and ends with EOI (FF D9), the way a canvas writes
 * it. Anything else (a video, a renamed file, a truncated upload) is refused.
 */
export function isJpeg(bytes: Uint8Array): boolean {
  const n = bytes.length;

  return (
    n > 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[n - 2] === 0xff &&
    bytes[n - 1] === 0xd9
  );
}

/** Why the phone refuses a file before decoding it, or null when it may try. */
export function refuseFile(file: { type: string; size: number }): string | null {
  if (file.type.startsWith("video/")) return "Solo fotos: los videos no se suben";
  if (file.type && !file.type.startsWith("image/")) return "Solo fotos";
  if (file.size > MAX_SOURCE_BYTES) return "Es demasiado grande";

  return null;
}
