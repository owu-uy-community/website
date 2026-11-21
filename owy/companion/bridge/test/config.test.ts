import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDevices, resolveDevicePsk } from "../src/config";

describe("device specs", () => {
  it("parses the shorthand with optional port and psk", () => {
    expect(parseDevices("owy-1@owy-companion.local, owy-2@192.168.1.5:6054#abc=")).toEqual([
      { id: "owy-1", host: "owy-companion.local", port: 6053, psk: null },
      { id: "owy-2", host: "192.168.1.5", port: 6054, psk: "abc=" },
    ]);
  });

  it("parses a JSON array", () => {
    expect(parseDevices('[{"id":"a","host":"h"}]')).toEqual([{ id: "a", host: "h", port: 6053, psk: null }]);
  });

  it("rejects malformed entries", () => {
    expect(() => parseDevices("nope")).toThrow(/inválida/);
  });

  it("resolves #secrets from the firmware secrets file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "owy-secrets-"));
    const file = path.join(dir, "secrets.yaml");
    writeFileSync(file, 'wifi_ssid: "x"\napi_key: "AbC123+/="   # noise key\nota_password: "y"\n');
    expect(resolveDevicePsk("secrets", file)).toBe("AbC123+/=");
    expect(resolveDevicePsk("literal", file)).toBe("literal");
    expect(resolveDevicePsk(null, file)).toBeNull();
    expect(() => resolveDevicePsk("secrets", path.join(dir, "missing.yaml"))).toThrow(/no se pudo leer/);
  });
});
