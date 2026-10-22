import { after } from "next/server";

/**
 * Run work after the response is sent: `after()` inside a request (Vercel keeps the function alive
 * for it); called outside one (tests, scripts), it just runs detached.
 */
export function later(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch((error: unknown) => console.error("[later] task failed", error));
  }
}
