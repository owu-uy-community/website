import type { ScheduleHandlerArgs } from "eve/schedules";
import slack from "../channels/slack";
import telegram from "../channels/telegram";
import { eventToday } from "./dates";

/**
 * Proactive announcement plumbing for the day-of schedules.
 *
 * Targets come from env and are optional — with nothing configured the
 * schedules no-op, so deploys are safe by default:
 * - OWY_ANNOUNCE_SLACK_CHANNEL_ID: Slack channel id (C…) to post in.
 * - OWY_ANNOUNCE_TELEGRAM_CHAT_ID: Telegram chat id (negative for groups).
 * - OWY_CONF_DATE (default 2026-11-07): the schedules only announce on this
 *   date (America/Montevideo) even though crons fire every Nov 7.
 */

export function isConfDay(now: Date = new Date()): boolean {
  const confDate = process.env.OWY_CONF_DATE ?? "2026-11-07";
  return eventToday(now) === confDate;
}

/**
 * Sends `prompt` as a session input on every configured channel target; the
 * agent's reply is what lands in the channel. Skips entirely outside conf day
 * or with no targets configured.
 */
export function announceToAll(args: ScheduleHandlerArgs, prompt: string): void {
  const { to, waitUntil, appAuth } = args;

  if (!isConfDay()) {
    console.log("[owy] schedule skipped: not conf day (set OWY_CONF_DATE to change)");
    return;
  }

  const slackChannelId = process.env.OWY_ANNOUNCE_SLACK_CHANNEL_ID?.trim();
  if (slackChannelId) {
    waitUntil(to(slack, { channelId: slackChannelId }).send(prompt, { auth: appAuth }));
  }

  const telegramChatId = process.env.OWY_ANNOUNCE_TELEGRAM_CHAT_ID?.trim();
  if (telegramChatId) {
    waitUntil(to(telegram, { chatId: telegramChatId }).send(prompt, { auth: appAuth }));
  }

  if (!slackChannelId && !telegramChatId) {
    console.log("[owy] schedule skipped: no OWY_ANNOUNCE_* targets configured");
  }
}
