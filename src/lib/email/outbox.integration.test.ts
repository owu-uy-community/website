import { createId } from "@paralleldrive/cuid2";
import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { emailDeliveries } from "lib/db/schema";
import { liveServices } from "lib/orpc/services";
import { server } from "test/msw/server";

import { mailboxMessages } from "./mailbox";
import { drainEmail, enqueueEmail } from "./outbox";

const run = Effect.runPromiseWith(liveServices);
const drain = () => run(drainEmail({ deadline: Date.now() + 10_000 }));

/** Queue one email to a fresh address; returns its dedupe key and recipient. */
async function queue(overrides: { priority?: number } = {}) {
  const to = `${createId()}@test.owu.uy`;
  const dedupeKey = `test:${to}`;
  await run(
    enqueueEmail({ kind: "test", to, dedupeKey, subject: "Hola", html: "<p>Hola</p>", text: "Hola", ...overrides })
  );

  return { to, dedupeKey };
}

const rowOf = async (dedupeKey: string) =>
  (await db.select().from(emailDeliveries).where(eq(emailDeliveries.dedupeKey, dedupeKey)))[0];

describe("the email outbox", () => {
  afterEach(() => vi.unstubAllEnvs());

  describe("with the dev mailbox", () => {
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "");
      vi.stubEnv("EMAIL_MAILBOX", "1");
    });

    test("the same dedupe key queues one email", async () => {
      const { to, dedupeKey } = await queue();
      await run(enqueueEmail({ kind: "test", to, dedupeKey, subject: "Otra vez", html: "", text: "" }));

      const rows = await db.select().from(emailDeliveries).where(eq(emailDeliveries.dedupeKey, dedupeKey));

      expect(rows).toHaveLength(1);
      expect(rows[0].subject).toBe("Hola");
    });

    test("drains running at once send every email exactly once", async () => {
      const queued = await Promise.all(Array.from({ length: 8 }, () => queue()));

      await Promise.all([drain(), drain(), drain()]);

      for (const { to } of queued) expect(mailboxMessages(to)).toHaveLength(1);
      const rows = await db
        .select({ status: emailDeliveries.status, attempts: emailDeliveries.attempts })
        .from(emailDeliveries)
        .where(
          inArray(
            emailDeliveries.dedupeKey,
            queued.map((item) => item.dedupeKey)
          )
        );
      expect(rows.every((row) => row.status === "sent" && row.attempts === 1)).toBe(true);
    });

    test("an email stuck sending after a crash goes out again", async () => {
      const { to, dedupeKey } = await queue();
      await db
        .update(emailDeliveries)
        .set({ status: "sending", claimedAt: new Date(Date.now() - 20 * 60_000), attempts: 1 })
        .where(eq(emailDeliveries.dedupeKey, dedupeKey));

      await drain();

      await expect(rowOf(dedupeKey)).resolves.toMatchObject({ status: "sent", attempts: 2 });
      expect(mailboxMessages(to)).toHaveLength(1);
    });
  });

  describe("through Resend", () => {
    beforeEach(() => vi.stubEnv("RESEND_API_KEY", "re_test"));

    test("a busy Resend is retried later; a refused address is given up", async () => {
      server.use(
        http.post("https://api.resend.com/emails", async ({ request }) => {
          const { to } = (await request.json()) as { to: string[] };

          return to[0].startsWith("bad-")
            ? HttpResponse.json({ message: "Invalid `to` field" }, { status: 422 })
            : HttpResponse.json({ message: "Too many requests" }, { status: 429 });
        })
      );
      const busy = await queue();
      const bad = `bad-${createId()}@test.owu.uy`;
      await run(enqueueEmail({ kind: "test", to: bad, dedupeKey: `test:${bad}`, subject: "x", html: "x", text: "x" }));

      await drain();

      const retried = await rowOf(busy.dedupeKey);
      expect(retried).toMatchObject({ status: "queued", attempts: 1 });
      expect(retried.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      await expect(rowOf(`test:${bad}`)).resolves.toMatchObject({
        status: "failed",
        error: expect.stringContaining("422"),
      });
    });

    test("a sent email keeps Resend's id", async () => {
      server.use(http.post("https://api.resend.com/emails", () => HttpResponse.json({ id: "re-123" })));
      const { dedupeKey } = await queue({ priority: 1 });

      await drain();

      await expect(rowOf(dedupeKey)).resolves.toMatchObject({ status: "sent", providerId: "re-123" });
    });
  });
});
