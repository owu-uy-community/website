/**
 * Holding a role on the platform or in a community needs a Slack account in the OWU workspace
 * (owu.slack.com). Signing in stays open to everyone: attendees RSVP with any Slack or an email code.
 */
export const OWU_SLACK_TEAM_ID = "T03FS7KF3";

/**
 * Until this date roles count without the OWU Slack, so people who hold one today have time to link
 * it (the dashboard shows them a banner). Set at rollout; see `pnpm auth:migrate-rbac` for who is affected.
 */
export const OWU_SLACK_REQUIRED_FROM = new Date("2026-12-01T03:00:00.000Z");

export const owuSlackRequired = (now = Date.now()) => now >= OWU_SLACK_REQUIRED_FROM.getTime();

/**
 * The Slack workspace in a Slack OpenID Connect ID token. Better Auth got the token straight from
 * Slack's token endpoint during the sign-in, so its payload is read, not re-verified.
 */
export function slackTeamOf(idToken: string | null | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const team = claims["https://slack.com/team_id"];

    return typeof team === "string" ? team : null;
  } catch {
    return null;
  }
}
