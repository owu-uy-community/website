import "server-only";

import { Effect } from "effect";
import * as z from "zod";

import type { RemoteRef } from "../db/schema";
import { UpstreamFailed } from "../orpc/errors";
import { fetchJson } from "../orpc/http";

/**
 * Messages that go out as Owy, sent by the site itself with Owy's bot credentials (the agent
 * keeps answering on its own; this is only the outbound side). Each channel is optional:
 * without its credentials it reports "not configured" instead of pretending it sent.
 *
 * - Telegram: the attendee channel (`TELEGRAM_BOT_TOKEN`, `OWY_ANNOUNCE_TELEGRAM_CHAT_ID`).
 * - Slack: the community channel and DMs to staff (`OWY_SLACK_BOT_TOKEN`,
 *   `OWY_ANNOUNCE_SLACK_CHANNEL_ID`); staff Slack ids come from their sign-in account.
 */
const env = () => ({
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChat: process.env.OWY_ANNOUNCE_TELEGRAM_CHAT_ID,
  slackToken: process.env.OWY_SLACK_BOT_TOKEN,
  slackChannel: process.env.OWY_ANNOUNCE_SLACK_CHANNEL_ID,
});

export type OwyChannels = { telegram: boolean; slack: boolean; staffDm: boolean };

export const owyChannels = (): OwyChannels => {
  const { telegramToken, telegramChat, slackToken, slackChannel } = env();
  return {
    telegram: Boolean(telegramToken && telegramChat),
    slack: Boolean(slackToken && slackChannel),
    staffDm: Boolean(slackToken),
  };
};

const NOT_CONFIGURED: Record<keyof OwyChannels, string> = {
  telegram:
    "Owy no puede escribir en Telegram desde el sitio: faltan TELEGRAM_BOT_TOKEN y OWY_ANNOUNCE_TELEGRAM_CHAT_ID",
  slack: "Owy no puede escribir en Slack desde el sitio: faltan OWY_SLACK_BOT_TOKEN y OWY_ANNOUNCE_SLACK_CHANNEL_ID",
  staffDm: "Owy no puede mandar mensajes directos: falta OWY_SLACK_BOT_TOKEN",
};

const notConfigured = (channel: keyof OwyChannels) =>
  Effect.fail(new UpstreamFailed({ service: "Owy", message: NOT_CONFIGURED[channel] }));

const TelegramAnswer = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
  /** The message for a send or an edit, `true` for a delete. */
  result: z.unknown().optional(),
});
const SlackAnswer = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  channel: z.string().optional(),
  ts: z.string().optional(),
});

/** `doing`: what the call was ("aceptó el mensaje", "dejó editarlo"). `fine` lists answers that mean done anyway. */
const ensureOk = (
  service: string,
  answer: { ok: boolean; description?: string; error?: string },
  doing = "aceptó el mensaje",
  fine: readonly string[] = []
) => {
  const why = answer.description ?? answer.error ?? "";

  return answer.ok || fine.some((text) => why.includes(text))
    ? Effect.void
    : Effect.fail(new UpstreamFailed({ service, message: `${service} no ${doing} (${why})` }));
};

const telegram = (method: string, body: object, doing: string, fine: readonly string[] = []) =>
  Effect.gen(function* () {
    const { telegramToken } = env();
    if (!telegramToken) return yield* notConfigured("telegram");
    const answer = yield* fetchJson(
      "Telegram",
      `https://api.telegram.org/bot${telegramToken}/${method}`,
      TelegramAnswer,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    yield* ensureOk("Telegram", answer, doing, fine);

    return answer;
  });

const slack = (method: string, body: object, doing: string, fine: readonly string[] = []) =>
  Effect.gen(function* () {
    const { slackToken } = env();
    if (!slackToken) return yield* notConfigured("staffDm");
    const answer = yield* fetchJson("Slack", `https://slack.com/api/${method}`, SlackAnswer, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${slackToken}` },
      body: JSON.stringify(body),
    });
    yield* ensureOk("Slack", answer, doing, fine);

    return answer;
  });

/** Post to Owy's attendee channel on Telegram. */
export const sendTelegram = (text: string) =>
  Effect.gen(function* () {
    const { telegramToken, telegramChat } = env();
    if (!telegramToken || !telegramChat) return yield* notConfigured("telegram");
    const { result } = yield* telegram(
      "sendMessage",
      { chat_id: telegramChat, text, disable_web_page_preview: true },
      "aceptó el mensaje"
    );
    const sent = result as { message_id?: number; chat?: { id: number | string } } | undefined;

    return sent?.message_id && sent.chat
      ? ({ service: "telegram", chatId: String(sent.chat.id), messageId: sent.message_id } satisfies RemoteRef)
      : null;
  });

const postSlack = (channel: string, text: string) =>
  slack("chat.postMessage", { channel, text, unfurl_links: false }, "aceptó el mensaje").pipe(
    Effect.map((answer) =>
      answer.channel && answer.ts
        ? ({ service: "slack", channel: answer.channel, ts: answer.ts } satisfies RemoteRef)
        : null
    )
  );

/** Post to the community's Slack channel. */
export const sendSlackChannel = (text: string) =>
  Effect.gen(function* () {
    const { slackChannel } = env();
    if (!slackChannel) return yield* notConfigured("slack");

    return yield* postSlack(slackChannel, text);
  });

/** A direct message from Owy to one person (their Slack user id opens the DM). */
export const sendSlackDm = (slackUserId: string, text: string) => postSlack(slackUserId, text);

/** Rewrite a message where it landed. The same text again is no change, not a failure. */
export const editRemote = (ref: RemoteRef, text: string) =>
  ref.service === "telegram"
    ? telegram(
        "editMessageText",
        { chat_id: ref.chatId, message_id: ref.messageId, text, disable_web_page_preview: true },
        "dejó editarlo",
        ["message is not modified"]
      ).pipe(Effect.asVoid)
    : slack("chat.update", { channel: ref.channel, ts: ref.ts, text }, "dejó editarlo").pipe(Effect.asVoid);

/**
 * Delete a message where it landed; one already gone counts as deleted. Telegram only lets a bot
 * delete what it sent in the last 48 hours: past that it says no, and it has to go by hand.
 */
export const deleteRemote = (ref: RemoteRef) =>
  ref.service === "telegram"
    ? telegram("deleteMessage", { chat_id: ref.chatId, message_id: ref.messageId }, "dejó borrarlo", [
        "message to delete not found",
      ]).pipe(Effect.asVoid)
    : slack("chat.delete", { channel: ref.channel, ts: ref.ts }, "dejó borrarlo", ["message_not_found"]).pipe(
        Effect.asVoid
      );
