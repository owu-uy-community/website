import { defaultSlackAuth, slackChannel, type SlackContext, type SlackMessage } from "eve/channels/slack";

/**
 * Slack channel for the OWU community workspace (slack.owu.uy).
 *
 * Credentials come from SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET (portable
 * Slack-app mode). To switch to Vercel Connect-managed credentials later, pass
 * `credentials: connectSlackCredentials("slack/owy")` from `@vercel/connect/eve`
 * — see the README runbook.
 *
 * Everyone in the workspace can talk to Owy (it's a community bot). Staff
 * detection is a context hint here; the sensitive tools re-verify against the
 * OWY_STAFF_SLACK_IDS allowlist on their own.
 */

function staffIds(): Set<string> {
  return new Set(
    (process.env.OWY_STAFF_SLACK_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function buildTurn(ctx: SlackContext, message: SlackMessage) {
  const auth = defaultSlackAuth(message, ctx);
  if (!auth) return null;

  const userId = message.author?.userId;
  const name = message.author?.fullName ?? message.author?.userName ?? "alguien";
  const isStaff = userId !== undefined && staffIds().has(userId);

  const context = [
    [
      `Estás hablando por Slack con ${name}${userId ? ` (id ${userId})` : ""}.`,
      isStaff
        ? "Esta persona ES parte del staff de la organización: puede pedirte gestión de grilla, OBS y estadísticas."
        : "Esta persona no figura como staff: ayudala con información, pero la gestión (grilla/OBS/stats) no está disponible para ella.",
    ].join(" "),
  ];

  return { auth, context };
}

export default slackChannel({
  // Inject prior thread replies only since Owy's last reply (incremental).
  threadContext: { since: "last-agent-reply" },

  // Photos allowed (staff digitizing physical board cards). Needs the Slack
  // app scope `files:read`.
  uploadPolicy: {
    allowedMediaTypes: ["image/*"],
    maxBytes: 10 * 1024 * 1024,
  },

  async onAppMention(ctx, message) {
    await ctx.thread.startTyping("Pensando… 🧉");
    return buildTurn(ctx, message);
  },

  async onDirectMessage(ctx, message) {
    await ctx.thread.startTyping("Pensando… 🧉");
    return buildTurn(ctx, message);
  },
});
