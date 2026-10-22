import { call } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "lib/db";
import { activity, outboundMessages } from "lib/db/schema";
import { router } from "lib/orpc/router";
import { by } from "test/context";
import { makeBoard, makeMember, makeSiteAdmin } from "test/factories";
import { server } from "test/msw/server";

const TELEGRAM = "https://api.telegram.org/bottest-token/sendMessage";
const SLACK = "https://slack.com/api/chat.postMessage";

/** Owy's Telegram channel, configured and answering `answer`; returns the texts it got. */
function telegram(answer: () => Response = () => HttpResponse.json({ ok: true })) {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  vi.stubEnv("OWY_ANNOUNCE_TELEGRAM_CHAT_ID", "-100123");
  const texts: string[] = [];
  server.use(
    http.post(TELEGRAM, async ({ request }) => {
      texts.push(((await request.json()) as { text: string }).text);
      return answer();
    })
  );
  return texts;
}

async function setup() {
  const board = await makeBoard();
  const admin = await makeSiteAdmin();
  return { ...board, eventId: board.event.id, admin };
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

/** A scheduled message whose time came, written straight to the table (the API refuses past times). */
const due = async (eventId: string, createdById: string, body: string) => {
  const [row] = await db
    .insert(outboundMessages)
    .values({ eventId, channel: "telegram", body, scheduledAt: minutesFromNow(-5), createdById })
    .returning();
  return row;
};

const messageRow = async (id: string) =>
  (await db.select().from(outboundMessages).where(eq(outboundMessages.id, id)))[0];

describe("comms", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("comms access", () => {
    test("only site staff read or send Owy's messages", async () => {
      const { eventId, community } = await setup();
      const owner = await makeMember(community.id, "owner");

      await expect(call(router.comms.list, { eventId }, by(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(call(router.comms.list, { eventId }, by(owner))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        call(router.comms.send, { eventId, channel: "telegram", body: "Hola" }, by(owner))
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(call(router.comms.dispatchDue, { eventId }, by(owner))).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    test("an unknown event is NOT_FOUND", async () => {
      const { admin } = await setup();

      await expect(call(router.comms.list, { eventId: "nope" }, by(admin))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("dispatching scheduled messages", () => {
    test("due messages go out exactly once, even with several tabs dispatching at once", async () => {
      const { eventId, admin } = await setup();
      const texts = telegram();
      const rows = await Promise.all(["Uno", "Dos", "Tres"].map((body) => due(eventId, admin.id, body)));

      const results = await Promise.all(
        Array.from({ length: 4 }, () => call(router.comms.dispatchDue, { eventId }, by(admin)))
      );

      expect(texts.toSorted()).toStrictEqual(["Dos", "Tres", "Uno"]);
      expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(3);
      for (const row of rows) {
        await expect(messageRow(row.id)).resolves.toMatchObject({ status: "sent", error: null });
      }
      // Nothing left: another round sends nothing.
      await expect(call(router.comms.dispatchDue, { eventId }, by(admin))).resolves.toStrictEqual({
        sent: 0,
        failed: 0,
      });
      expect(texts).toHaveLength(3);
    });

    test("a message that isn't due yet waits", async () => {
      const { eventId, admin } = await setup();
      const texts = telegram();
      await call(
        router.comms.schedule,
        { eventId, channel: "telegram", body: "Mañana", scheduledAt: minutesFromNow(30).toISOString() },
        by(admin)
      );

      await expect(call(router.comms.dispatchDue, { eventId }, by(admin))).resolves.toStrictEqual({
        sent: 0,
        failed: 0,
      });
      expect(texts).toStrictEqual([]);
    });

    test("a failure is recorded with Telegram's error, and the log credits whoever wrote it", async () => {
      const { eventId, admin } = await setup();
      const otherAdmin = await makeSiteAdmin();
      telegram(() => HttpResponse.json({ ok: false, description: "Bad Request: chat not found" }));
      const row = await due(eventId, admin.id, "Arrancamos");

      await expect(call(router.comms.dispatchDue, { eventId }, by(otherAdmin))).resolves.toStrictEqual({
        sent: 0,
        failed: 1,
      });

      const failed = await messageRow(row.id);
      expect(failed.status).toBe("failed");
      expect(failed.error).toContain("chat not found");
      const [line] = await db
        .select()
        .from(activity)
        .where(and(eq(activity.entityId, row.id), eq(activity.verb, "message.failed")));
      expect(line).toMatchObject({ actorId: admin.id, summary: "no pudo mandar por Telegram «Arrancamos»" });
    });

    test("a send left hanging is marked failed instead of being sent again", async () => {
      const { eventId, admin } = await setup();
      const texts = telegram();
      const [row] = await db
        .insert(outboundMessages)
        .values({ eventId, channel: "telegram", body: "Colgado", status: "sending", sentAt: minutesFromNow(-10) })
        .returning();

      await expect(call(router.comms.dispatchDue, { eventId }, by(admin))).resolves.toStrictEqual({
        sent: 0,
        failed: 1,
      });

      expect(texts).toStrictEqual([]);
      await expect(messageRow(row.id)).resolves.toMatchObject({ status: "failed" });
    });
  });

  describe("sending and scheduling", () => {
    test("sending now goes out through Owy and is logged as sent", async () => {
      const { eventId, admin } = await setup();
      const texts = telegram();

      const message = await call(router.comms.send, { eventId, channel: "telegram", body: "¡Hola!" }, by(admin));

      expect(texts).toStrictEqual(["¡Hola!"]);
      expect(message).toMatchObject({ status: "sent", channel: "telegram", createdBy: { id: admin.id } });
      expect(message.sentAt).not.toBeNull();
    });

    test("an unconfigured channel fails the send with a clear message, and the attempt stays in the log", async () => {
      const { eventId, admin } = await setup();

      await expect(
        call(router.comms.send, { eventId, channel: "telegram", body: "Sin token" }, by(admin))
      ).rejects.toMatchObject({ code: "BAD_GATEWAY", message: expect.stringContaining("TELEGRAM_BOT_TOKEN") });

      const [logged] = await call(router.comms.list, { eventId }, by(admin));
      expect(logged).toMatchObject({ status: "failed", body: "Sin token" });
    });

    test("a time that already passed is refused", async () => {
      const { eventId, admin } = await setup();

      await expect(
        call(
          router.comms.schedule,
          { eventId, channel: "telegram", body: "Tarde", scheduledAt: minutesFromNow(-10).toISOString() },
          by(admin)
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    test("a cadence step takes one live message; cancelling frees it", async () => {
      const { eventId, admin } = await setup();
      const input = {
        eventId,
        channel: "telegram" as const,
        body: "Mañana es el día",
        step: "t-1" as const,
        scheduledAt: minutesFromNow(60).toISOString(),
      };
      const first = await call(router.comms.schedule, input, by(admin));

      await expect(call(router.comms.schedule, input, by(admin))).rejects.toMatchObject({
        code: "CONFLICT",
        data: { reason: "step_taken" },
      });
      await call(router.comms.cancel, { eventId, messageId: first.id }, by(admin));
      await expect(call(router.comms.schedule, input, by(admin))).resolves.toMatchObject({ status: "scheduled" });
    });

    test("a scheduled message can be edited and cancelled only while it waits", async () => {
      const { eventId, admin } = await setup();
      telegram();
      const scheduled = await call(
        router.comms.schedule,
        { eventId, channel: "telegram", body: "Versión 1", scheduledAt: minutesFromNow(60).toISOString() },
        by(admin)
      );

      const edited = await call(
        router.comms.update,
        { eventId, messageId: scheduled.id, body: "Versión 2", channel: "slack" },
        by(admin)
      );
      expect(edited).toMatchObject({ body: "Versión 2", channel: "slack", status: "scheduled" });

      const sent = await call(router.comms.send, { eventId, channel: "telegram", body: "Ya salió" }, by(admin));
      await expect(
        call(router.comms.update, { eventId, messageId: sent.id, body: "Otra cosa" }, by(admin))
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(call(router.comms.cancel, { eventId, messageId: sent.id }, by(admin))).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("a message from another event is NOT_FOUND", async () => {
      const { eventId, admin } = await setup();
      const elsewhere = await setup();
      const scheduled = await call(
        router.comms.schedule,
        {
          eventId: elsewhere.eventId,
          channel: "telegram",
          body: "Ajeno",
          scheduledAt: minutesFromNow(60).toISOString(),
        },
        by(admin)
      );

      await expect(call(router.comms.cancel, { eventId, messageId: scheduled.id }, by(admin))).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("the cadence", () => {
    test("each step has its time on the event's clock, its copy and its status", async () => {
      const { eventId, event, community, admin } = await setup();
      vi.stubEnv("TELEGRAM_BOT_USERNAME", "@OwyBot");
      const cadence = await call(router.comms.cadence, { eventId }, by(admin));
      const t7 = cadence.steps.find((step) => step.key === "t-7");
      const t1 = cadence.steps.find((step) => step.key === "t-1");

      // The event starts on sáb 7 nov at 14:30 in Montevideo (UTC-3).
      expect(cadence.steps.map((step) => [step.key, step.at])).toStrictEqual([
        ["t-7", "2026-10-31T13:00:00.000Z"],
        ["t-1", "2026-11-06T13:00:00.000Z"],
        ["morning", "2026-11-07T12:00:00.000Z"],
        ["t+1", "2026-11-08T13:00:00.000Z"],
      ]);
      expect(t1?.body).toContain(`Mañana es ${event.name}: abrimos a las 14:30.`);
      expect(t7?.body).toContain(`/comunidad/${community.slug}/events/${event.slug}`);
      expect(t7?.body).toContain("https://t.me/OwyBot");
      expect(cadence.steps.every((step) => step.status === "missing")).toBe(true);
    });

    test("a step is sent, scheduled or missing, as the shell's checklist counts it", async () => {
      const { eventId, admin } = await setup();
      await call(router.comms.markSent, { eventId, step: "t-7", body: "Falta una semana" }, by(admin));
      await call(
        router.comms.schedule,
        { eventId, channel: "telegram", body: "Mañana", step: "t-1", scheduledAt: minutesFromNow(60).toISOString() },
        by(admin)
      );

      const after = await call(router.comms.cadence, { eventId }, by(admin));
      expect(after.steps.map((step) => step.status)).toStrictEqual(["sent", "scheduled", "missing", "missing"]);
      expect(after.steps[0].message).toMatchObject({ channel: "email", status: "sent" });
      // The shell's checklist counts the same steps.
      const status = await call(router.shell.status, { eventId }, by(admin));
      expect(status.prep.find((item) => item.key === "comms")?.meta).toMatch(/^2 de 4/);
    });

    test("a T-7 marked as sent by mistake can be taken back", async () => {
      const { eventId, admin } = await setup();
      const marked = await call(router.comms.markSent, { eventId, step: "t-7", body: "Email" }, by(admin));

      await call(router.comms.cancel, { eventId, messageId: marked.id }, by(admin));

      const cadence = await call(router.comms.cadence, { eventId }, by(admin));
      expect(cadence.steps[0].status).toBe("missing");
    });
  });

  describe("reminding the staff", () => {
    test("Owy DMs, on Slack, whoever hasn't marked an announcement as received", async () => {
      const { eventId, community, admin } = await setup();
      const [editor] = await Promise.all([
        makeMember(community.id, "editor", { name: "Editora" }),
        makeMember(community.id, "member", { name: "Con Slack" }, { slack: "U0SLACK1" }),
        makeMember(community.id, "member", { name: "Sin Slack" }, { slack: false }),
      ]);
      vi.stubEnv("OWY_SLACK_BOT_TOKEN", "xoxb-test");
      const dms: { channel: string; text: string }[] = [];
      server.use(
        http.post(SLACK, async ({ request }) => {
          dms.push((await request.json()) as { channel: string; text: string });
          return HttpResponse.json({ ok: true });
        })
      );
      const { id: announcementId } = await call(
        router.staffTasks.announcements.create,
        { eventId, body: "Foto grupal a las 20:25", urgent: true },
        by(editor)
      );

      const result = await call(router.comms.remind, { eventId, announcementId }, by(admin));

      expect(result).toStrictEqual({ sent: 1, withoutSlack: 1 });
      expect(dms.map((dm) => dm.channel)).toStrictEqual(["U0SLACK1"]);
      expect(dms[0].text).toContain("Foto grupal a las 20:25");
      const [logged] = await call(router.comms.list, { eventId }, by(admin));
      expect(logged).toMatchObject({ channel: "staff_dm", status: "sent", recipients: 1 });
    });

    test("with nobody reachable on Slack it says so instead of pretending", async () => {
      const { eventId, community, admin } = await setup();
      const editor = await makeMember(community.id, "editor");
      await makeMember(community.id, "member", {}, { slack: false });
      const { id: announcementId } = await call(
        router.staffTasks.announcements.create,
        { eventId, body: "Aviso" },
        by(editor)
      );

      await expect(call(router.comms.remind, { eventId, announcementId }, by(admin))).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Slack"),
      });
    });
  });
});

/**
 * Owy's Telegram and Slack, configured: sends land with an id, and edits and deletes are recorded.
 * `deleteAnswer` stands in for Telegram's "no" past 48 hours.
 */
function owyApis({ deleteAnswer = () => HttpResponse.json({ ok: true, result: true }) } = {}) {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  vi.stubEnv("OWY_ANNOUNCE_TELEGRAM_CHAT_ID", "-100123");
  vi.stubEnv("OWY_SLACK_BOT_TOKEN", "xoxb-test");
  vi.stubEnv("OWY_ANNOUNCE_SLACK_CHANNEL_ID", "C123");
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const record = async (method: string, request: Request) => {
    calls.push({ method, body: (await request.json()) as Record<string, unknown> });
  };
  server.use(
    http.post("https://api.telegram.org/bottest-token/sendMessage", async ({ request }) => {
      await record("sendMessage", request);
      return HttpResponse.json({ ok: true, result: { message_id: 7, chat: { id: -100123 } } });
    }),
    http.post("https://api.telegram.org/bottest-token/editMessageText", async ({ request }) => {
      await record("editMessageText", request);
      return HttpResponse.json({ ok: true, result: { message_id: 7, chat: { id: -100123 } } });
    }),
    http.post("https://api.telegram.org/bottest-token/deleteMessage", async ({ request }) => {
      await record("deleteMessage", request);
      return deleteAnswer();
    }),
    http.post(SLACK, async ({ request }) => {
      await record("chat.postMessage", request);
      return HttpResponse.json({ ok: true, channel: "C123", ts: "1730000000.000100" });
    }),
    http.post("https://slack.com/api/chat.delete", async ({ request }) => {
      await record("chat.delete", request);
      return HttpResponse.json({ ok: true });
    })
  );
  return calls;
}

describe("editing and deleting what Owy already sent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("a Telegram message keeps where it landed, and an edit rewrites it there for everyone", async () => {
    const { eventId, admin } = await setup();
    const calls = owyApis();
    const sent = await call(router.comms.send, { eventId, channel: "telegram", body: "Abrimos 14:30" }, by(admin));

    const edited = await call(router.comms.update, { eventId, messageId: sent.id, body: "Abrimos 15:00" }, by(admin));

    expect(sent.remote).toBe(1);
    expect(calls.find((item) => item.method === "editMessageText")?.body).toMatchObject({
      chat_id: "-100123",
      message_id: 7,
      text: "Abrimos 15:00",
    });
    expect(edited).toMatchObject({ body: "Abrimos 15:00", status: "sent" });
    expect(edited.editedAt).not.toBeNull();
  });

  test("once out, only the text changes", async () => {
    const { eventId, admin } = await setup();
    owyApis();
    const sent = await call(router.comms.send, { eventId, channel: "telegram", body: "Hola" }, by(admin));

    await expect(
      call(router.comms.update, { eventId, messageId: sent.id, channel: "slack", body: "Hola" }, by(admin))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("deleting a Slack post deletes it in the channel too", async () => {
    const { eventId, admin } = await setup();
    const calls = owyApis();
    const sent = await call(router.comms.send, { eventId, channel: "slack", body: "Pizza en el patio" }, by(admin));

    await call(router.comms.remove, { eventId, messageId: sent.id }, by(admin));

    expect(calls.find((item) => item.method === "chat.delete")?.body).toStrictEqual({
      channel: "C123",
      ts: "1730000000.000100",
    });
    await expect(messageRow(sent.id)).resolves.toBeUndefined();
  });

  test("when Telegram won't delete it (past 48 hours) it stays, and it can still leave the list alone", async () => {
    const { eventId, admin } = await setup();
    const calls = owyApis({
      deleteAnswer: () => HttpResponse.json({ ok: false, description: "Bad Request: message can't be deleted" }),
    });
    const sent = await call(router.comms.send, { eventId, channel: "telegram", body: "Viejo" }, by(admin));

    await expect(call(router.comms.remove, { eventId, messageId: sent.id }, by(admin))).rejects.toMatchObject({
      code: "BAD_GATEWAY",
      message: expect.stringContaining("Telegram no dejó borrarlo"),
    });
    await expect(messageRow(sent.id)).resolves.toBeDefined();
    await call(router.comms.remove, { eventId, messageId: sent.id, onlyHere: true }, by(admin));

    await expect(messageRow(sent.id)).resolves.toBeUndefined();
    expect(calls.filter((item) => item.method === "deleteMessage")).toHaveLength(1);
    const [line] = await db
      .select({ summary: activity.summary })
      .from(activity)
      .where(and(eq(activity.entityId, sent.id), eq(activity.verb, "message.deleted")));
    expect(line.summary).toMatch(/^quitó de la lista lo que mandó por Telegram/);
  });

  test("what went out before the site kept track can't be edited, but can leave the list", async () => {
    const { eventId, admin } = await setup();
    const calls = owyApis();
    const [old] = await db
      .insert(outboundMessages)
      .values({
        eventId,
        channel: "telegram",
        body: "De antes",
        status: "sent",
        sentAt: new Date(),
        createdById: admin.id,
      })
      .returning();

    await expect(
      call(router.comms.update, { eventId, messageId: old.id, body: "Corregido" }, by(admin))
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await call(router.comms.remove, { eventId, messageId: old.id }, by(admin));

    await expect(messageRow(old.id)).resolves.toBeUndefined();
    expect(calls).toStrictEqual([]);
  });

  test("only site staff delete Owy's messages", async () => {
    const { eventId, community, admin } = await setup();
    owyApis();
    const owner = await makeMember(community.id, "owner");
    const sent = await call(router.comms.send, { eventId, channel: "telegram", body: "Hola" }, by(admin));

    await expect(call(router.comms.remove, { eventId, messageId: sent.id }, by(owner))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
