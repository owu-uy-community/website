import { telegramChannel } from "eve/channels/telegram";

/**
 * Telegram channel for attendees (and staff) during OWU Conf.
 *
 * Credentials come from TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET_TOKEN.
 * The webhook must be registered once against the deployed URL
 * (`/eve/v1/telegram`) — see the README runbook.
 *
 * Defaults handle dispatch: private chats always reach Owy; in groups only
 * /commands, @mentions of the bot, or replies to Owy's messages wake it.
 * Staff-only tools ask the site with the person's Telegram id, once they
 * linked it (owu.uy → /acceso → Vincular Telegram, then /vincular <código>).
 */
export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "owy_bot",
  // Photos allowed (e.g. staff sending a picture of the physical board);
  // documents stay off to keep the surface small.
  uploadPolicy: {
    allowedMediaTypes: ["image/*"],
    maxBytes: 10 * 1024 * 1024,
  },
});
