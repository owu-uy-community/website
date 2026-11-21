import { describe, expect, test } from "vitest";

import { enqueue, flush, readQueue, type QueuedScan } from "./scan-queue";

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
};

const scan = (nonce: string): QueuedScan => ({
  nonce,
  code: `code-${nonce}`,
  device: "Puerta 2",
  scannedAt: "2026-11-07T17:42:00.000Z",
});

describe("the scanner's offline queue", () => {
  test("keeps scans in order, once per nonce", () => {
    const store = memory();
    enqueue("e1", scan("a"), store);
    enqueue("e1", scan("b"), store);
    enqueue("e1", scan("a"), store);

    expect(readQueue("e1", store).map((queued) => queued.nonce)).toStrictEqual(["b", "a"]);
  });

  test("a flush sends oldest first and stops at the first failure worth retrying", async () => {
    const store = memory();
    for (const nonce of ["a", "b", "c", "d"]) enqueue("e1", scan(nonce), store);
    const offline = new TypeError("Failed to fetch");
    const rejected = Object.assign(new Error("Datos inválidos"), { status: 400 });

    const result = await flush("e1", store, async (queued) => {
      if (queued.nonce === "b") throw rejected;
      if (queued.nonce === "c") throw offline;
      return queued.nonce;
    });

    // "b" was answered (a 400 won't change by retrying), "c" and what follows wait.
    expect(result).toStrictEqual({ sent: ["a"], left: [scan("c"), scan("d")] });
  });

  test("a broken entry in storage reads as an empty queue", () => {
    const store = memory();
    store.setItem("owu-scanner:queue:e1", "{nope");

    expect(readQueue("e1", store)).toStrictEqual([]);
  });
});
