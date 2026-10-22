import "server-only";

import { Effect } from "effect";
import * as z from "zod";

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

const TelegramAnswer = z.object({ ok: z.boolean(), description: z.string().optional() });
const SlackAnswer = z.object({ ok: z.boolean(), error: z.string().optional() });

const ensureOk = (service: string, answer: { ok: boolean; description?: string; error?: string }) =>
  answer.ok
    ? Effect.void
    : Effect.fail(
        new UpstreamFailed({
          service,
          message: `${service} no aceptó el mensaje (${answer.description ?? answer.error})`,
        })
      );

/** Post to Owy's attendee channel on Telegram. */
export const sendTelegram = (text: string) =>
  Effect.gen(function* () {
    const { telegramToken, telegramChat } = env();
    if (!telegramToken || !telegramChat) return yield* notConfigured("telegram");
    const answer = yield* fetchJson(
      "Telegram",
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      TelegramAnswer,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChat, text, disable_web_page_preview: true }),
      }
    );
    yield* ensureOk("Telegram", answer);
  });

const postSlack = (channel: string, text: string) =>
  Effect.gen(function* () {
    const { slackToken } = env();
    if (!slackToken) return yield* notConfigured("staffDm");
    const answer = yield* fetchJson("Slack", "https://slack.com/api/chat.postMessage", SlackAnswer, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${slackToken}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    yield* ensureOk("Slack", answer);
  });

/** Post to the community's Slack channel. */
export const sendSlackChannel = (text: string) =>
  Effect.gen(function* () {
    const { slackChannel } = env();
    if (!slackChannel) return yield* notConfigured("slack");
    yield* postSlack(slackChannel, text);
  });

/** A direct message from Owy to one person (their Slack user id opens the DM). */
export const sendSlackDm = (slackUserId: string, text: string) => postSlack(slackUserId, text);
