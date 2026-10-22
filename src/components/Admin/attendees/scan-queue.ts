/**
 * The scanner's offline queue: scans made without signal wait in localStorage, each with the
 * nonce it was made with, and go out in order when the phone is back online. The server counts
 * a nonce once, so sending one twice (a flaky connection) never counts anyone twice.
 */
export type QueuedScan = { nonce: string; code: string; device: string; scannedAt: string };

type Store = Pick<Storage, "getItem" | "setItem">;

const keyOf = (eventId: string) => `owu-scanner:queue:${eventId}`;

export function readQueue(eventId: string, store: Store): QueuedScan[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(keyOf(eventId)) ?? "[]");
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export function enqueue(eventId: string, scan: QueuedScan, store: Store): QueuedScan[] {
  const queue = [...readQueue(eventId, store).filter((queued) => queued.nonce !== scan.nonce), scan];
  store.setItem(keyOf(eventId), JSON.stringify(queue));
  return queue;
}

/** A failure worth retrying: no connection, a timeout, or the server having a bad moment. */
export function isTransient(error: unknown) {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status !== "number" || status >= 500 || status === 408 || status === 429;
}

/**
 * Send the queue, oldest first. A scan the server answered (even "unknown") leaves the queue;
 * a transient failure stops the flush and keeps it and everything after it for the next try.
 */
export async function flush<Result>(
  eventId: string,
  store: Store,
  send: (scan: QueuedScan) => Promise<Result>
): Promise<{ sent: Result[]; left: QueuedScan[] }> {
  const sent: Result[] = [];
  for (const scan of readQueue(eventId, store)) {
    try {
      sent.push(await send(scan));
    } catch (error) {
      if (isTransient(error)) break;
    }
    store.setItem(
      keyOf(eventId),
      JSON.stringify(readQueue(eventId, store).filter((queued) => queued.nonce !== scan.nonce))
    );
  }

  return { sent, left: readQueue(eventId, store) };
}
