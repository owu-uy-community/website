import { describe, expect, test } from "vitest";

import { isJpeg, isPhoneId, refuseFile } from "./conf-photos";

describe("conf photos guardrails", () => {
  test("only a whole JPEG passes", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]))).toBe(true);
    // Truncated (no EOI), PNG, MP4 (ftyp box), empty.
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]))).toBe(false);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
    expect(isJpeg(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBe(false);
    expect(isJpeg(new Uint8Array())).toBe(false);
  });

  test("the phone refuses videos and non-images before decoding", () => {
    expect(refuseFile({ type: "video/quicktime", size: 1000 })).toMatch(/videos/);
    expect(refuseFile({ type: "application/pdf", size: 1000 })).toBe("Solo fotos");
    expect(refuseFile({ type: "image/jpeg", size: 200 * 1024 * 1024 })).toMatch(/grande/);
    expect(refuseFile({ type: "image/heic", size: 3_000_000 })).toBeNull();
    // Some pickers leave the type empty: decoding decides.
    expect(refuseFile({ type: "", size: 3_000_000 })).toBeNull();
  });

  test("phone ids are only what the route mints", () => {
    expect(isPhoneId("AbCdEfGhIjKlMnOpQrSt_-")).toBe(true);
    expect(isPhoneId("short")).toBe(false);
    expect(isPhoneId("AbCdEfGhIjKlMnOpQrSt_/")).toBe(false);
    expect(isPhoneId(undefined)).toBe(false);
  });
});
