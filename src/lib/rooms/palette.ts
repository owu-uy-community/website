/**
 * Data-driven room colors. A room can set an explicit hex (`rooms.color`);
 * otherwise it gets a stable palette color derived from its id, so colors
 * survive renames and never collide with a hardcoded venue vocabulary.
 */

export const ROOM_PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
] as const;

export function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

export function roomColorFor(roomId: string, explicit?: string | null): string {
  if (explicit && /^#[0-9a-fA-F]{6}$/.test(explicit)) return explicit;

  return ROOM_PALETTE[hashId(roomId) % ROOM_PALETTE.length];
}

/** Lighten (positive pct) or darken (negative pct) a #rrggbb color. */
export function shadeHex(hex: string, pct: number): string {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const amount = Math.round(2.55 * pct);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const r = num >> 16;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Card gradient + border, matching the old per-room hardcoded treatment. */
export function roomCardStyle(color: string): { background: string; borderColor: string } {
  return {
    background: `linear-gradient(135deg, ${shadeHex(color, 14)}, ${color})`,
    borderColor: shadeHex(color, -22),
  };
}

/** Glow shadow used when a card is a swap target during drag. */
export function roomSwapShadow(color: string): string {
  return `0 8px 16px ${hexWithAlpha(shadeHex(color, -22), 0.4)}, 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)`;
}

/**
 * Deterministic tilt for a sticky note. Ids are cuid2 strings, so the hash —
 * not parseInt — is what keeps this from degenerating into rotate(NaNdeg).
 */
export function stickyNoteRotation(noteId: string): number {
  return ((hashId(noteId) % 5) - 2) * 0.75;
}

/**
 * Sticky-note surface shared by the admin board and the kiosk wall.
 * Slightly darkened gradient so the white title keeps contrast on the
 * lighter palette entries (amber, lime, cyan).
 */
export function stickyNoteStyle(color: string): {
  background: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
} {
  return {
    background: `linear-gradient(140deg, ${shadeHex(color, 6)}, ${shadeHex(color, -12)})`,
    borderColor: shadeHex(color, -26),
    borderRadius: "10px 14px 8px 16px",
    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.22)",
  };
}
