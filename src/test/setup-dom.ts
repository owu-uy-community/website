import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// Radix primitives call these pointer/scroll APIs, which happy-dom leaves out.
for (const [name, stub] of [
  ["hasPointerCapture", () => false],
  ["setPointerCapture", () => undefined],
  ["releasePointerCapture", () => undefined],
  ["scrollIntoView", () => undefined],
] as const) {
  if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: stub, configurable: true });
}
